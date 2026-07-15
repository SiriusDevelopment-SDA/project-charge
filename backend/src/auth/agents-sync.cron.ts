import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../companies/entities/companies';
import { AuthService } from './auth.service';

/**
 * Reconciliacao DIARIA (4h, horario de Brasilia) do sync de agentes do Maestro.
 *
 * O caminho principal e event-driven: o Maestro empurra POST /webhooks/agents
 * quando um agente muda. Este cron e a REDE DE SEGURANCA para eventos perdidos
 * (webhook que falhou/nao chegou): uma vez por dia, off-peak, ressincroniza
 * TODAS as empresas ATIVAS. Empresas inativas sao puladas (filtro na query).
 *
 * Reusa o nucleo `AuthService.syncAgentsForCompany(companyId)` — mesma logica do
 * botao "Importar e sincronizar agentes" e do webhook, so que por companyId e em
 * lote. Tolerante a falha por empresa (uma que falha nao derruba as demais).
 */
@Injectable()
export class AgentsSyncCron {
  private readonly logger = new Logger(AgentsSyncCron.name);

  /** Evita sobreposicao caso uma execucao anterior ainda esteja rodando. */
  private isRunning = false;

  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly authService: AuthService,
  ) {}

  @Cron('0 0 4 * * *', { timeZone: 'America/Sao_Paulo' })
  async syncAgentsDaily(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn(
        '[AgentsSync] Execucao anterior ainda em andamento — pulando este tick',
      );
      return;
    }
    this.isRunning = true;
    this.logger.log(
      '[AgentsSync] Iniciando reconciliacao diaria de agentes (4h) — fallback do webhook',
    );

    let ok = 0;
    let failed = 0;

    try {
      const companies = await this.companyRepository.find({
        where: { active: true },
        select: { id: true, name: true },
      });

      if (!companies.length) {
        this.logger.verbose('[AgentsSync] Nenhuma empresa ativa encontrada');
        return;
      }

      for (const company of companies) {
        try {
          const r = await this.authService.syncAgentsForCompany(company.id);
          ok += 1;
          this.logger.log(`[AgentsSync] ${company.name}: ${r.message}`);
        } catch (err) {
          failed += 1;
          const msg = (err as Error)?.message ?? String(err);
          this.logger.error(
            `[AgentsSync] Falha na empresa ${company.name} (${company.id}): ${msg}`,
          );
        }
      }

      this.logger.log(
        `[AgentsSync] Reconciliacao concluida — ok: ${ok}, falhas: ${failed}, total (ativas): ${companies.length}`,
      );
    } finally {
      this.isRunning = false;
    }
  }
}
