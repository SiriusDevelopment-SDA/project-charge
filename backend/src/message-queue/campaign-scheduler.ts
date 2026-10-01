import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DateTime } from 'luxon';
import { In, Repository } from 'typeorm';
import { Campaign } from '../campaigns/entities/campanhas.entity';
import { Templates } from '../templates/entities/templatesMeta';
import { MessageQueueService } from './message-queue.service';
import { isBusinessDay } from '../common/utils/business-day.util';
import {
  normalizeDispatchNumber,
  TemplateDispatchPayloadService,
} from '../templates/template-dispatch-payload.service';
import { CampaignMetricsGateway } from '../realtime/campaigns-metrics.gateway';
import { InvoicesService } from '../invoices/invoices.service';
import { InvoiceSyncCron } from '../invoices/invoice-sync.cron';
import { InvoiceSyncState } from '../invoices/entities/invoice-sync-state.entity';
import {
  CampaignErpRetryService,
  ERP_RETRY_ESCALATE_AFTER_ATTEMPTS,
  ERP_RETRY_MAX_ATTEMPTS_PER_DAY,
  type CampaignErpRetryState,
} from './campaign-erp-retry.service';

@Injectable()
export class CampaignScheduler {
  private readonly logger = new Logger(CampaignScheduler.name);

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,

    @InjectRepository(Templates)
    private readonly templateRepository: Repository<Templates>,

    @InjectRepository(InvoiceSyncState)
    private readonly syncStateRepo: Repository<InvoiceSyncState>,

    private readonly messageQueueService: MessageQueueService,

    private readonly templateDispatchPayload: TemplateDispatchPayloadService,

    private readonly campaignMetricsGateway: CampaignMetricsGateway,

    private readonly invoicesService: InvoicesService,

    private readonly invoiceSyncCron: InvoiceSyncCron,

    private readonly erpRetry: CampaignErpRetryService,
  ) {}

  /**
   * Runs every minute, checks for campaigns whose dispatch window has arrived,
   * and enqueues their messages.
   */
  @Cron('* * * * *')
  async checkAndDispatchCampaigns(): Promise<void> {
    try {
      const now = new Date();

      const campaigns = await this.campaignRepository.find({
        where: {
          isEnabled: true,
          status: In(['queue', 'pending']),
        },
        relations: ['company', 'template'],
        select: {
          id: true,
          status: true,
          isEnabled: true,
          startDate: true,
          endDate: true,
          dispatchTime: true,
          timezone: true,
          channelId: true,
          recurring: true,
          recurringType: true,
          recurringDays: true,
          lastDispatchedAt: true,
          invoiceRule: true,
          company: { id: true, account_chatwoot: true },
          template: { id: true },
        },
      });

      this.logger.log(`[CampaignScheduler] Found ${campaigns.length} active campaign(s) to check`);

      for (const campaign of campaigns) {
        const nowInTz = this.toDateTimeInZone(now, campaign.timezone);
        const todayStr = this.toDateOnly(now, campaign.timezone);
        const startStr = this.toDateOnly(campaign.startDate, campaign.timezone);
        const endStr = this.toDateOnly(campaign.endDate, campaign.timezone);
        const scheduledAt = this.getScheduledDispatchDateTime(campaign, now);
        this.logger.log(
          `[CampaignScheduler] campaign=${campaign.id} status=${campaign.status} recurring=${campaign.recurring} ` +
          `today=${todayStr} start=${startStr} end=${endStr} ` +
          `nowInTz=${nowInTz.toISO()} scheduledAt=${scheduledAt?.toISO() ?? 'null'} ` +
          `lastDispatchedAt=${campaign.lastDispatchedAt?.toISOString() ?? 'null'}`,
        );

        if (!this.isCampaignActiveOnDate(campaign, now)) {
          this.logger.warn(`[CampaignScheduler] campaign=${campaign.id} NOT active on date`);
          // Auto-finish any campaign (recurring or not) whose end date has passed
          // to prevent them from being fetched every minute indefinitely.
          const todayStr = this.toDateOnly(now, campaign.timezone);
          const endStr = this.toDateOnly(campaign.endDate, campaign.timezone);
          if (todayStr > endStr) {
            this.logger.warn(
              `[CampaignScheduler] campaign=${campaign.id} endDate=${endStr} has passed, marking as finished`,
            );
            await this.campaignRepository.update(campaign.id, { status: 'finished' });
            this.campaignMetricsGateway.emitCampaignsSync(campaign.company.account_chatwoot);
          }
          continue;
        }

        // Estado de um disparo de hoje que NAO concluiu porque o ERP nao
        // respondeu. Quando existe, ele manda em duas coisas: libera a campanha
        // da trava de "ja disparou hoje" e impoe o intervalo entre tentativas.
        const retryState = await this.erpRetry.get(campaign.id, todayStr);

        if (!this.shouldDispatchNow(campaign, now, retryState)) {
          this.logger.warn(`[CampaignScheduler] campaign=${campaign.id} shouldDispatchNow=false`);
          continue;
        }

        if (retryState && !this.erpRetry.isDue(retryState, now)) {
          this.logger.log(
            `[CampaignScheduler] campaign=${campaign.id} aguardando a janela de retry do ERP ` +
              `(tentativa ${retryState.attempts}/${ERP_RETRY_MAX_ATTEMPTS_PER_DAY}, ` +
              `proxima em ${this.erpRetry.secondsUntilDue(retryState, now)}s)`,
          );
          continue;
        }

        await this.enqueueCampaign(campaign, now, retryState);
      }
    } catch (err) {
      this.logger.error(`[CampaignScheduler] Unhandled error in checkAndDispatchCampaigns`, err);
    }
  }

  private shouldDispatchNow(
    campaign: Campaign,
    now: Date,
    retryState?: CampaignErpRetryState | null,
  ): boolean {
    const nowInTz = this.toDateTimeInZone(now, campaign.timezone);
    const scheduledAt = this.getScheduledDispatchDateTime(campaign, now);
    if (!scheduledAt || nowInTz.toMillis() < scheduledAt.toMillis()) return false;

    // Campanhas com status 'pending' foram manualmente re-enfileiradas pelo usuário
    // e devem disparar independentemente de já terem sido enviadas hoje.
    if (campaign.status === 'pending') return true;

    // O disparo de hoje ficou pela metade porque o ERP nao respondeu: a
    // campanha ainda tem destinatarios a avaliar, entao a trava de "ja disparou
    // hoje" nao vale. Ela existe para nao mandar duas vezes — e disso cuidam a
    // deduplicacao por telefone e o filtro do que ja foi enfileirado hoje.
    if (retryState) return true;

    // Avoid re-dispatching if already sent today
    if (campaign.lastDispatchedAt) {
      const lastDate = this.toDateOnly(
        campaign.lastDispatchedAt,
        campaign.timezone,
      );
      const todayStr = this.toDateOnly(now, campaign.timezone);
      if (lastDate === todayStr) return false;
    }

    return true;
  }

  private getScheduledDispatchDateTime(
    campaign: Campaign,
    now: Date,
  ): DateTime | null {
    const [parsedHour, parsedMinute] = String(campaign.dispatchTime ?? '00:00')
      .split(':')
      .map(Number);
    const hour = Number.isFinite(parsedHour) ? parsedHour : 0;
    const minute = Number.isFinite(parsedMinute) ? parsedMinute : 0;

    const baseDate = campaign.recurring ? now : campaign.startDate;
    const baseInZone = this.toDateTimeInZone(baseDate, campaign.timezone);

    if (!baseInZone.isValid) {
      return null;
    }

    return baseInZone.set({
      hour,
      minute,
      second: 0,
      millisecond: 0,
    });
  }

  private async enqueueCampaign(
    campaign: Campaign,
    now: Date,
    retryState: CampaignErpRetryState | null = null,
  ): Promise<void> {
    const dispatchDate = this.toDateOnly(now, campaign.timezone);

    try {
      const isRecurringWithRule =
        campaign.recurring &&
        campaign.invoiceRule?.operator &&
        campaign.company?.id;

      let scopedTemplateMapVars: Record<string, unknown>[];

      if (isRecurringWithRule) {
        const referenceDate = dispatchDate;
        this.logger.log(
          `[CampaignScheduler] campaign=${campaign.id} modo=dinâmico referenceDate=${referenceDate}`,
        );
        await this.ensureSyncedToday(campaign.company.id, now, campaign.timezone);
        try {
          scopedTemplateMapVars = await this.invoicesService.getRecipientsForDispatchDate(
            campaign.company.id,
            campaign.invoiceRule!,
            referenceDate,
          );
        } catch (err) {
          // Nao deu para montar a lista (banco ou Redis fora). Sem lista nao se
          // sabe se ha destinatarios — concluir aqui e justamente a perda
          // silenciosa que esta correcao existe para acabar.
          const aguardar = await this.registerErpFailure(campaign, now, dispatchDate, retryState, {
            lostRecipients: 0,
            reason: `falha ao montar a lista de destinatários: ${(err as Error)?.message ?? err}`,
          });
          if (aguardar) return;
          scopedTemplateMapVars = [];
        }
      } else {
        const campaignWithVars = await this.campaignRepository.findOne({
          where: { id: campaign.id },
          select: { id: true, templateMapVars: true },
        });
        scopedTemplateMapVars = this.getTemplateMapVarsForDispatchDate(
          { ...campaign, templateMapVars: campaignWithVars?.templateMapVars ?? [] },
          now,
        );
      }

      // Numa retentativa, quem ja foi enfileirado hoje sai da lista ANTES de
      // qualquer coisa: nao se consulta o ERP por ele de novo e ele nao volta a
      // ser candidato a envio. A deduplicacao do `enqueueBatch` continua no
      // lugar como segunda barreira.
      if (retryState) {
        scopedTemplateMapVars = await this.dropAlreadyEnqueuedToday(
          campaign,
          scopedTemplateMapVars,
          now,
        );
      }

      const templateEntity = await this.templateRepository.findOne({
        where: { id: campaign.template.id },
        relations: ['company'],
      });

      if (!templateEntity) {
        this.logger.error(`Campaign ${campaign.id}: template ${campaign.template.id} not found`);
        return;
      }

      const { recipients, skips } =
        await this.templateDispatchPayload.buildQueueRecipients(
          templateEntity,
          campaign.company.id,
          scopedTemplateMapVars as Record<string, unknown>[],
        );

      let batchId: string | null = null;
      let actuallyEnqueued = 0;
      if (recipients.length > 0) {
        const { batch, dedupedRecipients } = await this.messageQueueService.enqueueBatch({
          companyId: campaign.company.id,
          templateId: campaign.template.id,
          campaignId: campaign.id,
          channelId: campaign.channelId ?? null,
          recipients,
          scope: 'campaign',
          scheduledAt: now,
        });
        batchId = batch.id;
        actuallyEnqueued = batch.totalRecipients;

        if (dedupedRecipients.length > 0) {
          const dedupSkips = dedupedRecipients.map((r) => ({
            reason: 'duplicate_dispatch_today' as const,
            number: r.number,
            name: r.name,
            detail: 'Mensagem não enviada: Este destinatário já recebeu disparo hoje.',
          }));
          // Gravado já: é o desfecho definitivo destes destinatários, e numa
          // eventual retentativa eles nem chegam a ser reprocessados.
          await this.templateDispatchPayload.persistDispatchSkips(
            templateEntity,
            campaign.company.id,
            campaign.id,
            batchId,
            dedupSkips,
          );
        }
      }

      const account = campaign.company.account_chatwoot;

      // Destinatários perdidos porque o ERP não respondeu — e não porque não
      // tinham fatura. Só estes autorizam manter a campanha pendente.
      const erpUnavailable = skips.filter((s) => s.reason === 'erp_unavailable');

      if (erpUnavailable.length > 0) {
        // Campanha não recorrente que JÁ enfileirou parte dos destinatários não
        // volta: a conclusão do lote a marca como 'finished' e o agendador nunca
        // mais a seleciona. Esta é a última chance de dizer a verdade no
        // relatório, então ela segue para o desfecho normal.
        const podeRetentar = actuallyEnqueued === 0 || campaign.recurring;

        if (podeRetentar) {
          const aguardar = await this.registerErpFailure(campaign, now, dispatchDate, retryState, {
            lostRecipients: erpUnavailable.length,
            reason: erpUnavailable[0].detail ?? 'ERP indisponível no momento do disparo.',
          });

          if (aguardar) {
            // A campanha NÃO é marcada como executada: sem lastDispatchedAt e
            // sem 'finished'. O relatório também não recebe estes skips ainda —
            // enquanto há retentativa o disparo de hoje não terminou, e gravar
            // "não enviado" a cada 10 minutos encheria o relatório de linhas
            // que a tentativa seguinte desmente.
            if (actuallyEnqueued > 0) {
              // Parte saiu: o lote precisa aparecer como em andamento. Só cai
              // aqui campanha recorrente, então lastDispatchedAt continua sendo
              // responsabilidade da conclusão do lote, como no fluxo normal.
              await this.campaignRepository.update(campaign.id, { status: 'running' });
              this.campaignMetricsGateway.emitCampaignsSync(account);
            }
            return;
          }
        } else {
          this.logger.error(
            `[CampaignScheduler] campaign=${campaign.id} ERP indisponível para ` +
              `${erpUnavailable.length} destinatário(s), mas ${actuallyEnqueued} já foram enfileirados ` +
              `numa campanha não recorrente: sem retentativa, motivo registrado no relatório`,
          );
        }
      }

      // Disparo concluído (com sucesso ou desistindo): o estado de retry do dia
      // não serve mais, e o relatório recebe o desfecho de todos os pulos.
      await this.erpRetry.clear(campaign.id, dispatchDate);

      await this.templateDispatchPayload.persistDispatchSkips(
        templateEntity,
        campaign.company.id,
        campaign.id,
        batchId,
        skips,
      );

      if (recipients.length === 0 || actuallyEnqueued === 0) {
        this.logger.warn(
          `Campaign ${campaign.id} has no recipients for ${dispatchDate}, skipping` +
            (recipients.length > 0 ? ' (all deduped)' : '') +
            (erpUnavailable.length > 0 ? ` (${erpUnavailable.length} sem resposta do ERP)` : ''),
        );
        await this.campaignRepository.update(campaign.id, {
          lastDispatchedAt: now,
          status: campaign.recurring ? 'queue' : 'finished',
        });
        this.campaignMetricsGateway.emitCampaignsSync(account);
        return;
      }

      // Campanhas não recorrentes: lastDispatchedAt agora (não voltam para queue).
      // Recorrentes: lastDispatchedAt é setado ao voltar para queue (conclusão do batch).
      await this.campaignRepository.update(campaign.id, {
        status: 'running',
        ...(campaign.recurring ? {} : { lastDispatchedAt: now }),
      });
      this.campaignMetricsGateway.emitCampaignsSync(account);

      this.logger.log(
        `Enqueued ${actuallyEnqueued} message(s) for campaign ${campaign.id}` +
          (skips.length ? `; ${skips.length} skipped (see relatório)` : ''),
      );
    } catch (err) {
      this.logger.error(`Failed to enqueue campaign ${campaign.id}`, err);
    }
  }

  /**
   * Contabiliza uma tentativa frustrada por indisponibilidade do ERP.
   *
   * Devolve `true` quando a campanha deve continuar pendente (ainda há
   * tentativa no dia) e `false` quando o teto estourou — aí o disparo precisa
   * ser concluído com o motivo real gravado no relatório, em vez de ficar
   * repetindo para sempre sem ninguém perceber.
   */
  private async registerErpFailure(
    campaign: Campaign,
    now: Date,
    dispatchDate: string,
    previous: CampaignErpRetryState | null,
    params: { lostRecipients: number; reason: string },
  ): Promise<boolean> {
    const state = await this.erpRetry.registerFailure({
      campaignId: campaign.id,
      date: dispatchDate,
      now,
      lostRecipients: params.lostRecipients,
      reason: params.reason,
      previous,
    });

    const resumo =
      `[CampaignScheduler] campaign=${campaign.id} ERP indisponível no disparo de ${dispatchDate} ` +
      `(tentativa ${state.attempts}/${ERP_RETRY_MAX_ATTEMPTS_PER_DAY}, ` +
      `${state.lostRecipients} destinatário(s) sem resposta): ${state.reason}`;

    if (!this.erpRetry.hasAttemptsLeft(state)) {
      this.logger.error(
        `${resumo} — limite diário de tentativas atingido desde ${state.firstAttemptAt}; ` +
          `a campanha será concluída com o motivo registrado no relatório e só volta a ser ` +
          `avaliada amanhã. Verifique a integração do ERP desta empresa.`,
      );
      await this.erpRetry.clear(campaign.id, dispatchDate);
      return false;
    }

    // A severidade sobe com a insistência: uma piscada do ERP é warn, meia hora
    // fora vira error para aparecer em qualquer filtro de log.
    if (state.attempts >= ERP_RETRY_ESCALATE_AFTER_ATTEMPTS) {
      this.logger.error(`${resumo} — campanha mantida pendente, nova tentativa em 10 minutos`);
    } else {
      this.logger.warn(`${resumo} — campanha mantida pendente, nova tentativa em 10 minutos`);
    }

    return true;
  }

  /**
   * Tira da lista quem já tem mensagem enfileirada hoje para esta empresa.
   *
   * Só roda em retentativa. É o que garante que uma campanha entregue pela
   * metade não seja reenviada inteira: os que já foram enfileirados não são
   * reprocessados, não geram consulta nova ao ERP e não voltam para o lote.
   * A regra é a MESMA da deduplicação do `enqueueBatch` (mesmo método), que
   * segue valendo como segunda barreira.
   */
  private async dropAlreadyEnqueuedToday(
    campaign: Campaign,
    rows: Record<string, unknown>[],
    now: Date,
  ): Promise<Record<string, unknown>[]> {
    if (!rows.length) return rows;

    const enfileirados = await this.messageQueueService.getNumbersEnqueuedToday(
      campaign.company.id,
      now,
    );
    if (!enfileirados.size) return rows;

    const restantes = rows.filter(
      (row) => !enfileirados.has(normalizeDispatchNumber(row)),
    );

    if (restantes.length !== rows.length) {
      this.logger.log(
        `[CampaignScheduler] campaign=${campaign.id} retentativa: ${rows.length - restantes.length} ` +
          `destinatário(s) já enfileirado(s) hoje ficaram de fora; ${restantes.length} a avaliar`,
      );
    }

    return restantes;
  }

  private getTemplateMapVarsForDispatchDate(
    campaign: Campaign,
    now: Date,
  ): Record<string, unknown>[] {
    const templateMapVars = campaign.templateMapVars ?? [];
    const hasScopedRecipients = templateMapVars.some((vars) =>
      typeof vars?.dispatchDate === 'string' && String(vars.dispatchDate).trim(),
    );

    if (!hasScopedRecipients) {
      return templateMapVars;
    }

    const currentDispatchDate = this.toDateOnly(now, campaign.timezone);

    return templateMapVars.filter(
      (vars) => String(vars?.dispatchDate ?? '').trim() === currentDispatchDate,
    );
  }

  private isCampaignActiveOnDate(campaign: Campaign, now: Date): boolean {
    const todayInTimezone = this.toDateOnly(now, campaign.timezone);
    const startDate = this.toDateOnly(campaign.startDate, campaign.timezone);
    const endDate = this.toDateOnly(campaign.endDate, campaign.timezone);

    const withinRange = todayInTimezone >= startDate && todayInTimezone <= endDate;
    if (!withinRange) return false;

    // Não disparar em fins de semana nem feriados nacionais apenas para campanhas recorrentes.
    // Campanhas únicas (single) devem disparar independentemente do dia da semana.
    if (campaign.recurring) {
      const nowInTz = this.toDateTimeInZone(now, campaign.timezone);
      const localDate = new Date(nowInTz.year, nowInTz.month - 1, nowInTz.day);
      if (!isBusinessDay(localDate)) {
        this.logger.debug(
          `Campaign ${campaign.id} skipped: ${todayInTimezone} is a weekend or national holiday.`,
        );
        return false;
      }
    }

    if (campaign.recurringType === 'monthly_days') {
      return this.matchesRecurringSelection(campaign, now);
    }

    return true;
  }

  private matchesRecurringSelection(campaign: Campaign, now: Date): boolean {
    const todayInTimezone = this.toDateOnly(now, campaign.timezone);
    const dayOfMonth = this.toDateTimeInZone(now, campaign.timezone).day;

    return (campaign.recurringDays ?? []).some((value) => {
      if (typeof value === 'number') {
        return value === dayOfMonth;
      }

      if (typeof value !== 'string') {
        return false;
      }

      const normalizedValue = value.trim();
      if (!normalizedValue) {
        return false;
      }

      if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
        return normalizedValue === todayInTimezone;
      }

      const parsedDay = Number(normalizedValue);
      return Number.isInteger(parsedDay) && parsedDay === dayOfMonth;
    });
  }

  private async ensureSyncedToday(companyId: string, now: Date, timezone: string): Promise<void> {
    const todayStr = this.toDateOnly(now, timezone);

    const syncState = await this.syncStateRepo.findOne({
      where: { company: { id: companyId } },
    });

    const lastSuccessStr = syncState?.lastSuccessAt
      ? this.toDateOnly(syncState.lastSuccessAt, timezone)
      : null;

    if (lastSuccessStr === todayStr) {
      this.logger.log(
        `[CampaignScheduler] company=${companyId} sync já realizado hoje (${todayStr}), prosseguindo`,
      );
      return;
    }

    this.logger.warn(
      `[CampaignScheduler] company=${companyId} sync não realizado hoje (lastSuccess=${lastSuccessStr ?? 'nunca'}), forçando sincronização...`,
    );

    try {
      await this.invoiceSyncCron.syncCompanyById(companyId);
      this.logger.log(`[CampaignScheduler] company=${companyId} sync forçado concluído`);
    } catch (err) {
      this.logger.error(
        `[CampaignScheduler] company=${companyId} falha no sync forçado, prosseguindo com snapshot atual`,
        err,
      );
    }
  }

  private toDateOnly(date: Date, timeZone: string): string {
    return this.toDateTimeInZone(date, timeZone).toFormat('yyyy-LL-dd');
  }

  private toDateTimeInZone(date: Date, timeZone: string): DateTime {
    const zonedDate = DateTime.fromJSDate(date, { zone: timeZone });

    if (zonedDate.isValid) {
      return zonedDate;
    }

    this.logger.warn(
      `Timezone invalida "${timeZone}" na campanha. Aplicando UTC como fallback.`,
    );

    return DateTime.fromJSDate(date, { zone: 'UTC' });
  }
}
