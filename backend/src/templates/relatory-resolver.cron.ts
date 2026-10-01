import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RelatoryDispatchTemplate } from './entities/relatory.entity';
import { Client } from '../clients/entities.ts/clients';
import { Invoice } from '../invoices/entities/invoices';
import { IXCInvoicesService } from '../invoices/services/ixcInvoicesService';
import { HubsoftInvoicesService } from '../invoices/services/hubsoftInvoicesService';
import { SGPInvoicesService } from '../invoices/services/sgpInvoicesService';
import { MkInvoicesService } from '../invoices/services/mkInvoicesService';
import { GamaIspInvoicesService } from '../invoices/services/gamaIspInvoicesService';

type PendingGroup = { number: string; companyId: string };

@Injectable()
export class RelatoryResolverCron {
  private readonly logger = new Logger(RelatoryResolverCron.name);

  constructor(
    @InjectRepository(RelatoryDispatchTemplate)
    private readonly relatoryRepository: Repository<RelatoryDispatchTemplate>,

    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,

    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,

    private readonly ixcService: IXCInvoicesService,
    private readonly hubsoftService: HubsoftInvoicesService,
    private readonly sgpService: SGPInvoicesService,
    private readonly mkService: MkInvoicesService,
    private readonly gamaIspService: GamaIspInvoicesService,
  ) {}

  // Roda a cada 2 horas (horário de Brasília)
  @Cron('0 0 */2 * * *', { timeZone: 'America/Sao_Paulo' })
  async resolveRelatories(): Promise<void> {
    this.logger.log('[RelatoryResolver] Iniciando verificação de relatórios pendentes');

    const groups: PendingGroup[] = await this.relatoryRepository.manager.query(
      `SELECT DISTINCT r.number, r."companyId"
       FROM relatory_dispatch_template r
       JOIN templates t ON t.id = r."templateId"
       WHERE r.resolved = false
         AND LOWER(t.category) LIKE '%cobr%'`,
    );

    if (groups.length === 0) {
      this.logger.verbose('[RelatoryResolver] Nenhum relatorio pendente de resolução');
      return;
    }

    this.logger.log(`[RelatoryResolver] ${groups.length} cliente(s) a verificar`);

    let resolved = 0;
    for (const group of groups) {
      const wasResolved = await this.checkAndResolve(group.number, group.companyId);
      if (wasResolved) resolved++;
    }

    this.logger.log(`[RelatoryResolver] Concluído — ${resolved} cliente(s) marcado(s) como resolvido`);
  }

  private async checkAndResolve(number: string, companyId: string): Promise<boolean> {
    const client = await this.clientRepository.findOne({
      where: { whatsapp: number, company: { id: companyId } },
      relations: { company: true },
    });

    if (!client) {
      this.logger.verbose(`[RelatoryResolver] Cliente não encontrado — number: ${number}`);
      return false;
    }

    const erp = String(client.company.erp ?? '').toUpperCase();

    let hasPending: boolean;

    try {
      let result: { list: unknown[] };

      if (erp === 'IXC')result = await this.ixcService.getInvoices(client);
      else if (erp === 'HUBSOFT') result = await this.hubsoftService.getInvoices(client);
      else if (erp === 'SGP')result = await this.sgpService.getInvoices(client);
      else if (erp === 'MK') result = await this.mkService.getInvoices(client);
      else if (erp === 'GAMAISP') result = await this.gamaIspService.getInvoices(client);
      else {
        this.logger.warn(`[RelatoryResolver] ERP desconhecido "${erp}" para empresa ${companyId}`);
        return false;
      }

      hasPending = Array.isArray(result.list) && result.list.length > 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[RelatoryResolver] Falha ao consultar ERP para ${number}: ${message}`);
      return false;
    }

    if (hasPending) return false;

    const [dateRow]: [{ min_dispatch: Date | null }] =
      await this.relatoryRepository.manager.query(
        `SELECT MIN(r.date_dispatch) AS min_dispatch
         FROM relatory_dispatch_template r
         JOIN templates t ON t.id = r."templateId"
         WHERE r.number = $1 AND r."companyId" = $2
           AND r.resolved = false AND LOWER(t.category) LIKE '%cobr%'`,
        [number, companyId],
      );

    const minDispatch = dateRow?.min_dispatch ?? null;

    const [sumRow]: [{ total: string | null }] = await this.invoiceRepository.manager.query(
      `SELECT COALESCE(SUM(CAST(i.value AS NUMERIC)), 0)::text AS total
       FROM invoice i
       WHERE i."clientId" = $1
         AND i.status = 'Pago'
         AND ($2::timestamp IS NULL OR i."lastSyncAt" >= $2::timestamp)`,
      [client.id, minDispatch],
    );

    const recoveredAmount = sumRow?.total ? parseFloat(sumRow.total) : 0;

    await this.relatoryRepository.manager.query(
      `UPDATE relatory_dispatch_template r
       SET resolved = true, recovered_amount = $3
       FROM templates t
       WHERE r."templateId" = t.id
         AND r.number = $1
         AND r."companyId" = $2
         AND r.resolved = false
         AND LOWER(t.category) LIKE '%cobr%'`,
      [number, companyId, recoveredAmount],
    );

    this.logger.log(`[RelatoryResolver] ${number} resolvido — sem faturas pendentes (recuperado: R$ ${recoveredAmount.toFixed(2)})`);
    return true;
  }
}
