import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { DeepPartial, In, Repository } from "typeorm";
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";
import { Company } from "../companies/entities/companies";
import { Client } from "../clients/entities.ts/clients";
import { Invoice } from "./entities/invoices";
import { IXCInvoicesService } from "./services/ixcInvoicesService";
import { SGPInvoicesService } from "./services/sgpInvoicesService";
import { MkInvoicesService } from "./services/mkInvoicesService";
import {
  InvoiceSyncState,
  InvoiceSyncStatus,
} from "./entities/invoice-sync-state.entity";
import { InvoicesSyncGateway } from "../realtime/invoices-sync.gateway";
import { RedisService } from "../redis/redis.service";

const CHUNK_SIZE = 500;
const SYNC_LOOKBACK_YEARS = 1;

function toChunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size)
    result.push(arr.slice(i, i + size));
  return result;
}

function parseDate(str: string): Date | null {
  if (!str) return null;
  if (str.includes("/")) {
    const [d, m, y] = str.split("/").map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

type SyncContext = {
  reason: "cron" | "manual";
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
    private readonly mkService: MkInvoicesService,
    private readonly invoicesSyncGateway: InvoicesSyncGateway,
    private readonly redisService: RedisService,
  ) {}

  @Cron("0 */10 * * * *", { timeZone: "America/Sao_Paulo" })
  async syncAll(): Promise<void> {
    this.logger.log("[InvoiceSync] Iniciando sincronização de faturas");

    const companies = await this.companyRepo.find({ where: { active: true } });

    if (!companies.length) {
      this.logger.verbose("[InvoiceSync] Nenhuma empresa ativa encontrada");
      return;
    }

    let synced = 0;
    let failed = 0;
    let skippedMk = 0;
    for (const company of companies) {
      // MK/PROXER fica FORA desta cron de 10min por causa do volume: a cada sync
      // o MK exige 1 chamada de detalhe (WSMKSegundaViaCobranca) POR fatura, e a
      // janela de 1 ano tem ~61 mil faturas não-canceladas → ~61k requisições.
      // Rodar isso a cada 10 min martela a API do MK. O MK sincroniza via cron
      // diária às 4h (syncMkInvoicesDaily) + trigger manual
      // (POST /invoices/sync/company/:id). Ambos os caminhos reutilizam
      // runSyncForCompany → performSync → syncMK.
      if (String(company.erp).toUpperCase() === "MK") {
        skippedMk++;
        this.logger.debug(
          `[InvoiceSync] MK ignorado na cron de 10min (empresa: ${company.name}); sincroniza via cron diária 4h + trigger manual por causa do volume (1 detalhe por fatura)`,
        );
        continue;
      }

      try {
        synced += await this.runSyncForCompany(company, { reason: "cron" });
      } catch {
        failed++;
      }
    }

    if (skippedMk > 0) {
      this.logger.debug(
        `[InvoiceSync] ${skippedMk} empresa(s) MK puladas na cron de 10min (sincronizam via cron diária 4h + trigger manual)`,
      );
    }

    this.logger.log(
      `[InvoiceSync] Concluído — ${synced} faturas sincronizadas, ${failed} empresa(s) com erro`,
    );
  }

  @Cron("0 0 4 * * *", { timeZone: "America/Sao_Paulo" })
  async syncMkInvoicesDaily(): Promise<void> {
    this.logger.log(
      "[InvoiceSync] Iniciando sincronização diária de faturas MK (4h)",
    );

    const companies = await this.companyRepo.find({ where: { active: true } });
    const mkCompanies = companies.filter(
      (company) => String(company.erp).toUpperCase() === "MK",
    );

    if (!mkCompanies.length) {
      this.logger.verbose(
        "[InvoiceSync] Nenhuma empresa MK ativa encontrada para o sync diário",
      );
      return;
    }

    let synced = 0;
    let failed = 0;
    for (const company of mkCompanies) {
      try {
        // Reutiliza exatamente o mesmo caminho por-empresa que a cron de 10min e
        // o trigger manual usam (runSyncForCompany → performSync → syncMK), com a
        // mesma janela de 1 ano (getSyncWindow). O MK fica fora da cron recorrente
        // pelo volume (1 detalhe por fatura, ~61k/ano), mas precisa de snapshot
        // atualizado 1x/dia off-peak para alimentar as campanhas agendadas.
        synced += await this.runSyncForCompany(company, { reason: "cron" });
      } catch {
        failed++;
      }
    }

    this.logger.log(
      `[InvoiceSync] Sync diário MK concluído — ${synced} faturas sincronizadas em ${mkCompanies.length} empresa(s), ${failed} com erro`,
    );
  }

  async syncCompanyById(companyId: string): Promise<void> {
    const company = await this.companyRepo.findOne({
      where: { id: companyId, active: true },
    });

    if (!company) {
      throw new NotFoundException(`Empresa ${companyId} não encontrada.`);
    }

    await this.runSyncForCompany(company, { reason: "manual" });
  }

  async getStateByAccount(account: string): Promise<InvoiceSyncState | null> {
    const state = await this.syncStateRepo.findOne({
      where: {
        company: {
          account_chatwoot: account,
        },
      },
      relations: ["company"],
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
      status: "idle",
      invoicesSynced: 0,
      message: "Aguardando primeira sincronização.",
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

    const task = this.performSync(company, context).finally(() =>
      this.runningSyncs.delete(company.id),
    );

    this.runningSyncs.set(company.id, task);
    return task;
  }

  private async performSync(
    company: Company,
    context: SyncContext,
  ): Promise<number> {
    const erp = String(company.erp ?? "").toUpperCase();
    const startedAt = new Date();

    await this.updateState(company, "running", {
      lastStartedAt: startedAt,
      message:
        context.reason === "manual"
          ? "Sincronização manual iniciada."
          : "Sincronização automática iniciada.",
    });

    try {
      let synced = 0;

      if (erp === "IXC") {
        synced = await this.syncIXC(company);
      } else if (erp === "SGP") {
        synced = await this.syncSGP(company);
      } else if (erp === "MK") {
        synced = await this.syncMK(company);
      } else {
        this.logger.verbose(
          `[InvoiceSync] ERP não suportado: ${erp} (empresa: ${company.name})`,
        );
      }

      const finishedAt = new Date();
      await this.updateState(company, "success", {
        lastFinishedAt: finishedAt,
        lastSuccessAt: finishedAt,
        invoicesSynced: synced,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        message: `Sincronização concluída com ${synced} fatura(s) processada(s).`,
      });

      await this.cacheOpenInvoices(company.id);

      return synced;
    } catch (err: any) {
      const finishedAt = new Date();
      const message =
        err?.message ?? "Erro desconhecido ao sincronizar faturas.";

      await this.updateState(company, "error", {
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
        relations: ["company"],
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

  private async cacheOpenInvoices(companyId: string): Promise<void> {
    try {
      const count = await this.invoiceRepo.count({
        where: { company: { id: companyId }, status: "A Receber" },
      });

      if (count > 2000) {
        this.logger.warn(
          `[InvoiceSync] Cache de faturas ignorado para empresa ${companyId}: ${count} registros excedem o limite (5000). Consultas usarão o banco diretamente.`,
        );
        return;
      }

      const openInvoices = await this.invoiceRepo.find({
        where: { company: { id: companyId }, status: "A Receber" },
        select: {
          id_fatura: true,
          contractId: true,
          value: true,
          expiration: true,
          status: true,
          ticketDigitableLine: true,
          ticketPdfLink: true,
          pixCode: true,
          clientId: true,
          companyId: true,
        },
      });
      await this.redisService.set(
        `invoices:${companyId}:open`,
        openInvoices,
        720,
      );
    } catch (err) {
      this.logger.warn(
        `[InvoiceSync] Falha ao cachear faturas em aberto: ${(err as Error)?.message}`,
      );
    }
  }

  private getSyncWindow() {
    const now = new Date();

    const start = new Date(now);
    start.setFullYear(start.getFullYear() - SYNC_LOOKBACK_YEARS);

    const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

    return { start, end };
  }

  private async syncIXC(company: Company): Promise<number> {
    this.logger.log(
      `[InvoiceSync] IXC ${company.name} — buscando faturas em bulk`,
    );

    const { start, end } = this.getSyncWindow();
    const fmt = (date: Date) =>
      `${String(date.getDate()).padStart(2, "0")}/${String(
        date.getMonth() + 1,
      ).padStart(2, "0")}/${date.getFullYear()}`;

    const byClientId = await this.ixcService.getInvoicesByDateWindowBatch(
      company,
      fmt(start),
      fmt(end),
    );

    return this.persistSnapshot(company, byClientId, "IXC", start, end);
  }

  private async syncSGP(company: Company): Promise<number> {
    this.logger.log(
      `[InvoiceSync] SGP ${company.name} — buscando faturas em bulk`,
    );

    const { start, end } = this.getSyncWindow();
    const byCpf = await this.sgpService.getInvoicesByDateWindowBatch(
      company,
      start.toISOString().split("T")[0],
      end.toISOString().split("T")[0],
    );

    return this.persistSnapshot(company, byCpf, "SGP", start, end);
  }

  private async syncMK(company: Company): Promise<number> {
    this.logger.log(
      `[InvoiceSync] MK ${company.name} — buscando faturas em bulk`,
    );

    const { start, end } = this.getSyncWindow();
    // MK indexa faturas por código do cliente (codpessoa = client.clientId),
    // como o IXC — o persistSnapshot faz o lookup por clientId.
    const byClientId = await this.mkService.getInvoicesByDateWindowBatch(
      company,
      this.mkService.formatSyncDate(start),
      this.mkService.formatSyncDate(end),
    );

    return this.persistSnapshot(company, byClientId, "MK", start, end);
  }

  private async persistSnapshot(
    company: Company,
    sourceMap: Map<string, any[]>,
    erp: "IXC" | "SGP" | "MK",
    windowStart?: Date,
    windowEnd?: Date,
  ): Promise<number> {
    const existingOpenInvoices = await this.invoiceRepo.count({
      where: {
        company: { id: company.id },
        status: "A Receber",
      },
    });

    const clients = await this.clientRepo.find({
      where: { company: { id: company.id } },
      select: ["id", "clientId", "cnpj_cpf"],
    });

    const byClientId = new Map(
      clients.map((client) => [String(client.clientId), client]),
    );
    const byDocument = new Map(
      clients.map((client) => [
        String(client.cnpj_cpf ?? "").replace(/\D/g, ""),
        client,
      ]),
    );

    const fetchedInvoiceIds = new Set<string>();

    const toUpsertByConflictKey = new Map<
      string,
      QueryDeepPartialEntity<Invoice>
    >();
    let duplicateConflictTargets = 0;
    const syncTime = new Date();

    for (const [key, invoices] of sourceMap) {
      // SGP indexa por documento (CPF/CNPJ); IXC e MK indexam por clientId.
      const client =
        erp === "SGP"
          ? byDocument.get(String(key))
          : byClientId.get(String(key));
      if (!client) continue;

      for (const invoice of invoices) {
        const mapped = this.mapInvoiceSnapshot(
          company.id,
          client.id,
          invoice,
          erp,
          syncTime,
        );
        if (!mapped?.id_fatura) continue;

        if (typeof mapped.id_fatura !== "string") continue;
        fetchedInvoiceIds.add(mapped.id_fatura);

        const conflictKey = mapped.id_fatura;
        const existing = toUpsertByConflictKey.get(conflictKey);
        if (existing) {
          duplicateConflictTargets++;

          const existingClientId = String((existing as any).clientId ?? "");
          const incomingClientId = String((mapped as any).clientId ?? "");

          if (
            existingClientId &&
            incomingClientId &&
            existingClientId !== incomingClientId
          ) {
            this.logger.warn(
              `[InvoiceSync] ${erp} ${company.name}: fatura id_fatura=${mapped.id_fatura} apareceu para clientId diferente no mesmo snapshot (existing=${existingClientId}, incoming=${incomingClientId}). ` +
                `Mantendo a primeira ocorrência para evitar erro do Postgres no upsert.`,
            );
          }
          // Keep the first occurrence to make the dedupe deterministic.
        } else {
          toUpsertByConflictKey.set(conflictKey, mapped);
        }
      }
    }

    const toUpsert = Array.from(toUpsertByConflictKey.values());

    if (duplicateConflictTargets > 0) {
      this.logger.warn(
        `[InvoiceSync] ${erp} ${company.name}: detectadas ${duplicateConflictTargets} fatura(s) duplicada(s) no mesmo snapshot (id_fatura repetido). ` +
          `Para evitar erro do Postgres no upsert, apenas 1 versão por id_fatura foi mantida.`,
      );
    }

    if (existingOpenInvoices > 0 && toUpsert.length === 0) {
      throw new Error(
        `Sincronização abortada: o ERP retornou 0 faturas válidas para ${company.name} enquanto o snapshot ainda tinha ${existingOpenInvoices} fatura(s) aberta(s). Snapshot preservado para evitar baixa indevida.`,
      );
    }

    for (const chunk of toChunks(toUpsert, CHUNK_SIZE))
      await this.invoiceRepo.upsert(chunk, ["id_fatura", "companyId"]);

    await this.closeMissingOpenInvoices(
      company.id,
      fetchedInvoiceIds,
      syncTime,
      windowStart,
      windowEnd,
    );
    await this.markClientsAsChecked(
      clients.map((client) => client.id),
      syncTime,
    );

    this.logger.log(
      `[InvoiceSync] ${erp} ${company.name}: ${toUpsert.length} faturas sincronizadas`,
    );

    return toUpsert.length;
  }

  private mapInvoiceSnapshot(
    companyId: string,
    clientId: string,
    invoice: any,
    erp: "IXC" | "SGP" | "MK",
    syncTime: Date,
  ): QueryDeepPartialEntity<Invoice> | null {
    switch (erp) {
      case "IXC": {
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
          value: String(invoice.valor_aberto ?? invoice.valor ?? "0"),
          status: "A Receber",
          expiration: invoice.data_vencimento,
          ticketDigitableLine: null,
          ticketPdfLink: null,
          pixCode: null,
          lastSyncAt: syncTime,
          clientId: clientId,
          companyId: companyId,
        };
      }

      case "SGP": {
        const dueDate = parseDate(invoice.dataVencimento);
        if (!dueDate) return null;

        return {
          id_fatura: String(invoice.id),
          contractId: invoice.clienteContrato
            ? String(invoice.clienteContrato)
            : undefined,
          value: String(invoice.valorCorrigido ?? invoice.valor ?? "0"),
          status: "A Receber",
          expiration: invoice.dataVencimento,
          ticketDigitableLine:
            invoice.linhaDigitavel || invoice.codigoBarras || null,
          ticketPdfLink: invoice.link
            ? invoice.link.replace(/\/+$/, "") + ".pdf"
            : null,
          pixCode: invoice.codigoPix || null,
          lastSyncAt: syncTime,
          clientId: clientId,
          companyId: companyId,
        };
      }

      case "MK": {
        // Delega ao MkInvoicesService o mapeamento lista+detalhe -> upsert,
        // que retorna null quando não há vencimento (Vcto).
        return this.mkService.toInvoiceUpsert(invoice, {
          clientId,
          companyId,
          syncTime,
        });
      }

      default:
        throw new Error(`ERP não suportado: ${erp}`);
    }
  }

  private async closeMissingOpenInvoices(
    companyId: string,
    fetchedInvoiceIds: Set<string>,
    syncTime: Date,
    windowStart?: Date,
    windowEnd?: Date,
  ) {
    const fetchedArray = [...fetchedInvoiceIds];
    if (!fetchedArray.length) return;

    const startIso = windowStart?.toISOString().split("T")[0] ?? null;
    const endIso = windowEnd?.toISOString().split("T")[0] ?? null;

    const qb = this.invoiceRepo
      .createQueryBuilder()
      .update()
      .set({ status: "Pago", lastSyncAt: syncTime })
      .where('"companyId" = :companyId', { companyId })
      .andWhere("LOWER(TRIM(status)) = 'a receber'")
      .andWhere('"id_fatura" NOT IN (:...fetchedIds)', {
        fetchedIds: fetchedArray,
      });

    // Só fecha faturas dentro da janela de sync — não toca em faturas históricas fora do range
    if (startIso && endIso) {
      qb.andWhere(
        `CASE
          WHEN expiration ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN to_date(expiration, 'DD/MM/YYYY')
          WHEN expiration ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN to_date(expiration, 'YYYY-MM-DD')
          ELSE NULL
        END BETWEEN :startIso AND :endIso`,
        { startIso, endIso },
      );
    }

    await qb.execute();
  }

  private async markClientsAsChecked(clientIds: string[], syncTime: Date) {
    if (!clientIds.length) return;

    for (const chunk of toChunks(clientIds, CHUNK_SIZE)) {
      await this.clientRepo.update(
        { id: In(chunk) },
        {
          invoiceSnapshotCheckedAt: syncTime,
        },
      );
    }
  }
}
