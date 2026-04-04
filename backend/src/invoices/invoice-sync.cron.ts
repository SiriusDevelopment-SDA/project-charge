import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, In, Repository } from 'typeorm';
import { Company } from '../companies/entities/companies';
import { Client } from '../clients/entities.ts/clients';
import { Invoice } from './entities/invoices';
import { IXCInvoicesService } from './services/ixcInvoicesService';
import { SGPInvoicesService } from './services/sgpInvoicesService';
import {
  InvoiceSyncState,
  InvoiceSyncStatus,
} from './entities/invoice-sync-state.entity';
import { InvoicesSyncGateway } from '../realtime/invoices-sync.gateway';

const CHUNK_SIZE = 500;
const SYNC_LOOKBACK_YEARS = 5;

function toChunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

function parseDate(str: string): Date | null {
  if (!str) return null;
  if (str.includes('/')) {
    const [d, m, y] = str.split('/').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

type SyncContext = {
  reason: 'cron' | 'manual';
};

@Injectable()
export class InvoiceSyncCron {
  private readonly logger = new Logger(InvoiceSyncCron.name);
  private readonly runningSyncs = new Map<string, Promise<number>>();

  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,

    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,

    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,

    @InjectRepository(InvoiceSyncState)
    private readonly syncStateRepo: Repository<InvoiceSyncState>,

    private readonly ixcService: IXCInvoicesService,
    private readonly sgpService: SGPInvoicesService,
    private readonly invoicesSyncGateway: InvoicesSyncGateway,
  ) {}

  @Cron('0 */10 * * * *', { timeZone: 'America/Sao_Paulo' })
  async syncAll(): Promise<void> {
    this.logger.log('[InvoiceSync] Iniciando sincronização de faturas');

    const companies = await this.companyRepo.find({ where: { active: true } });

    if (!companies.length) {
      this.logger.verbose('[InvoiceSync] Nenhuma empresa ativa encontrada');
      return;
    }

    const results = await Promise.allSettled(
      companies.map((company) =>
        this.runSyncForCompany(company, { reason: 'cron' }),
      ),
    );

    let synced = 0;
    let failed = 0;
    for (const result of results) {
      if (result.status === 'fulfilled') synced += result.value;
      else failed++;
    }

    this.logger.log(
      `[InvoiceSync] Concluído — ${synced} faturas sincronizadas, ${failed} empresa(s) com erro`,
    );
  }

  async syncCompanyById(companyId: string): Promise<void> {
    const company = await this.companyRepo.findOne({
      where: { id: companyId, active: true },
    });

    if (!company) {
      throw new NotFoundException(`Empresa ${companyId} não encontrada.`);
    }

    await this.runSyncForCompany(company, { reason: 'manual' });
  }

  async getStateByAccount(account: string): Promise<InvoiceSyncState | null> {
    const state = await this.syncStateRepo.findOne({
      where: {
        company: {
          account_chatwoot: account,
        },
      },
      relations: ['company'],
    });

    if (state) {
      return state;
    }

    const company = await this.companyRepo.findOne({
      where: {
        account_chatwoot: account,
      },
    });

    if (!company) {
      return null;
    }

    return this.syncStateRepo.create({
      company,
      status: 'idle',
      invoicesSynced: 0,
      message: 'Aguardando primeira sincronização.',
    });
  }

  private async runSyncForCompany(
    company: Company,
    context: SyncContext,
  ): Promise<number> {
    const current = this.runningSyncs.get(company.id);
    if (current) {
      return current;
    }

    const task = this.performSync(company, context)
      .finally(() => this.runningSyncs.delete(company.id));

    this.runningSyncs.set(company.id, task);
    return task;
  }

  private async performSync(company: Company, context: SyncContext): Promise<number> {
    const erp = String(company.erp ?? '').toUpperCase();
    const startedAt = new Date();

    await this.updateState(company, 'running', {
      lastStartedAt: startedAt,
      message:
        context.reason === 'manual'
          ? 'Sincronização manual iniciada.'
          : 'Sincronização automática iniciada.',
    });

    try {
      let synced = 0;

      if (erp === 'IXC') {
        synced = await this.syncIXC(company);
      } else if (erp === 'SGP') {
        synced = await this.syncSGP(company);
      } else {
        this.logger.verbose(
          `[InvoiceSync] ERP não suportado: ${erp} (empresa: ${company.name})`,
        );
      }

      const finishedAt = new Date();
      await this.updateState(company, 'success', {
        lastFinishedAt: finishedAt,
        lastSuccessAt: finishedAt,
        invoicesSynced: synced,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        message: `Sincronização concluída com ${synced} fatura(s) processada(s).`,
      });

      return synced;
    } catch (err: any) {
      const finishedAt = new Date();
      const message = err?.message ?? 'Erro desconhecido ao sincronizar faturas.';

      await this.updateState(company, 'error', {
        lastFinishedAt: finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        message,
      });

      this.logger.error(
        `[InvoiceSync] Erro na empresa ${company.name} (${erp}): ${message}`,
      );

      throw err;
    }
  }

  private async updateState(
    company: Company,
    status: InvoiceSyncStatus,
    payload: Partial<InvoiceSyncState>,
  ) {
    const current =
      (await this.syncStateRepo.findOne({
        where: { company: { id: company.id } },
        relations: ['company'],
      })) ??
      this.syncStateRepo.create({
        company: { id: company.id } as Company,
      });

    const next = this.syncStateRepo.merge(current, {
      ...payload,
      company: { id: company.id } as Company,
      status,
    });

    const saved = await this.syncStateRepo.save(next);

    this.invoicesSyncGateway.emitSyncUpdate(company.account_chatwoot, {
      companyId: company.id,
      companyName: company.name,
      status: saved.status,
      message: saved.message,
      invoicesSynced: saved.invoicesSynced,
      lastStartedAt: saved.lastStartedAt?.toISOString() ?? null,
      lastFinishedAt: saved.lastFinishedAt?.toISOString() ?? null,
      lastSuccessAt: saved.lastSuccessAt?.toISOString() ?? null,
      durationMs: saved.durationMs ? Number(saved.durationMs) : null,
      updatedAt: saved.updatedAt?.toISOString() ?? new Date().toISOString(),
    });
  }

  private getSyncWindow() {
    const today = new Date();
    const start = new Date(today);
    start.setFullYear(start.getFullYear() - SYNC_LOOKBACK_YEARS);

    return { start, end: today };
  }

  private async syncIXC(company: Company): Promise<number> {
    this.logger.log(`[InvoiceSync] IXC ${company.name} — buscando faturas em bulk`);

    const { start, end } = this.getSyncWindow();
    const fmt = (date: Date) =>
      `${String(date.getDate()).padStart(2, '0')}/${String(
        date.getMonth() + 1,
      ).padStart(2, '0')}/${date.getFullYear()}`;

    const byClientId = await this.ixcService.getInvoicesByDateWindowBatch(
      company,
      fmt(start),
      fmt(end),
    );

    return this.persistSnapshot(company, byClientId, 'IXC');
  }

  private async syncSGP(company: Company): Promise<number> {
    this.logger.log(`[InvoiceSync] SGP ${company.name} — buscando faturas em bulk`);

    const { start, end } = this.getSyncWindow();
    const byCpf = await this.sgpService.getInvoicesByDateWindowBatch(
      company,
      start.toISOString().split('T')[0],
      end.toISOString().split('T')[0],
    );

    return this.persistSnapshot(company, byCpf, 'SGP');
  }

  private async persistSnapshot(
    company: Company,
    sourceMap: Map<string, any[]>,
    erp: 'IXC' | 'SGP',
  ): Promise<number> {
    const existingOpenInvoices = await this.invoiceRepo.count({
      where: {
        company: { id: company.id },
        status: 'A Receber',
      },
    });

    const clients = await this.clientRepo.find({
      where: { company: { id: company.id } },
      select: ['id', 'clientId', 'cnpj_cpf'],
    });

    const byClientId = new Map(clients.map((client) => [String(client.clientId), client]));
    const byDocument = new Map(
      clients.map((client) => [
        String(client.cnpj_cpf ?? '').replace(/\D/g, ''),
        client,
      ]),
    );

    const fetchedInvoiceIds = new Set<string>();
    const toUpsert: DeepPartial<Invoice>[] = [];
    const syncTime = new Date();

    for (const [key, invoices] of sourceMap) {
      const client =
        erp === 'IXC' ? byClientId.get(String(key)) : byDocument.get(String(key).replace(/\D/g, ''));

      if (!client) continue;

      for (const invoice of invoices) {
        const mapped = this.mapInvoiceSnapshot(company.id, client.cnpj_cpf, invoice, erp, syncTime);
        if (!mapped?.id_fatura) continue;

        fetchedInvoiceIds.add(mapped.id_fatura);
        toUpsert.push(mapped);
      }
    }

    if (existingOpenInvoices > 0 && toUpsert.length === 0) {
      throw new Error(
        `Sincronização abortada: o ERP retornou 0 faturas válidas para ${company.name} enquanto o snapshot ainda tinha ${existingOpenInvoices} fatura(s) aberta(s). Snapshot preservado para evitar baixa indevida.`,
      );
    }

    for (const chunk of toChunks(toUpsert, CHUNK_SIZE)) {
      await this.invoiceRepo.upsert(chunk, ['id_fatura', 'company']);
    }

    await this.closeMissingOpenInvoices(company.id, fetchedInvoiceIds, syncTime);

    this.logger.log(
      `[InvoiceSync] ${erp} ${company.name}: ${toUpsert.length} faturas sincronizadas`,
    );

    return toUpsert.length;
  }

  private mapInvoiceSnapshot(
    companyId: string,
    clientDocument: string,
    invoice: any,
    erp: 'IXC' | 'SGP',
    syncTime: Date,
  ): DeepPartial<Invoice> | null {
    if (erp === 'IXC') {
      const dueDate = parseDate(invoice.data_vencimento);
      if (!dueDate) return null;

      const contractId =
        invoice.id_contrato ||
        invoice.id_contrato_principal ||
        invoice.id_contrato_avulso ||
        null;

      return {
        id_fatura: String(invoice.id),
        contractId: contractId ? String(contractId) : undefined,
        value: String(invoice.valor_aberto ?? invoice.valor ?? '0'),
        status: 'A Receber',
        expiration: invoice.data_vencimento,
        ticketDigitableLine: null,
        ticketPdfLink: null,
        pixCode: null,
        lastSyncAt: syncTime,
        client: { cnpj_cpf: clientDocument } as Client,
        company: { id: companyId } as Company,
      };
    }

    if (!invoice.dataVencimento) return null;

    return {
      id_fatura: String(invoice.id),
      contractId: invoice.clienteContrato ? String(invoice.clienteContrato) : undefined,
      value: String(invoice.valorCorrigido ?? invoice.valor ?? '0'),
      status: 'A Receber',
      expiration: invoice.dataVencimento,
      ticketDigitableLine: invoice.linhaDigitavel || invoice.codigoBarras || null,
      ticketPdfLink: invoice.link || null,
      pixCode: invoice.codigoPix || null,
      lastSyncAt: syncTime,
      client: { cnpj_cpf: clientDocument } as Client,
      company: { id: companyId } as Company,
    };
  }

  private async closeMissingOpenInvoices(
    companyId: string,
    fetchedInvoiceIds: Set<string>,
    syncTime: Date,
  ) {
    const currentOpenInvoices = await this.invoiceRepo.find({
      where: {
        company: { id: companyId },
        status: 'A Receber',
      },
      select: ['id', 'id_fatura'],
    });

    const staleIds = currentOpenInvoices
      .filter((invoice) => !fetchedInvoiceIds.has(String(invoice.id_fatura ?? '')))
      .map((invoice) => invoice.id);

    if (!staleIds.length) return;

    for (const chunk of toChunks(staleIds, CHUNK_SIZE)) {
      await this.invoiceRepo.update(
        { id: In(chunk) },
        {
          status: 'Pago',
          lastSyncAt: syncTime,
        },
      );
    }
  }
}
