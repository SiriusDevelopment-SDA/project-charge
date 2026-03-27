import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RelatoryDispatchTemplate } from './entities/relatory.entity';
import { Client } from '../clients/entities.ts/clients';
import { IXCInvoicesService } from '../invoices/services/ixcInvoicesService';
import { HubsoftInvoicesService } from '../invoices/services/hubsoftInvoicesService';
import { SGPInvoicesService } from '../invoices/services/sgpInvoicesService';

type PendingGroup = { number: string; companyId: string };

@Injectable()
export class RelatoryResolverCron {
  private readonly logger = new Logger(RelatoryResolverCron.name);

  constructor(
    @InjectRepository(RelatoryDispatchTemplate)
    private readonly relatoryRepository: Repository<RelatoryDispatchTemplate>,

    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,

    private readonly ixcService: IXCInvoicesService,
    private readonly hubsoftService: HubsoftInvoicesService,
    private readonly sgpService: SGPInvoicesService,
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
         AND LOWER(t.category) = 'cobrança'`,
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

      if (erp === 'IXC') {
        result = await this.ixcService.getInvoices(client);
      } else if (erp === 'HUBSOFT') {
        result = await this.hubsoftService.getInvoices(client);
      } else if (erp === 'SGP') {
        result = await this.sgpService.getInvoices(client);
      } else {
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

    await this.relatoryRepository.manager.query(
      `UPDATE relatory_dispatch_template r
       SET resolved = true
       FROM templates t
       WHERE r."templateId" = t.id
         AND r.number = $1
         AND r."companyId" = $2
         AND r.resolved = false
         AND LOWER(t.category) = 'cobrança'`,
      [number, companyId],
    );

    this.logger.log(`[RelatoryResolver] ${number} resolvido — sem faturas pendentes`);
    return true;
  }
}
