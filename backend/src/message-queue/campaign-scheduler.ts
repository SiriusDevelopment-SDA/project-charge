import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DateTime } from 'luxon';
import { In, Repository } from 'typeorm';
import { Campaign } from '../campaigns/entities/campanhas.entity';
import { Templates } from '../templates/entities/templatesMeta';
import { MessageQueueService } from './message-queue.service';
import { isBusinessDay } from '../common/utils/business-day.util';
import { TemplateDispatchPayloadService } from '../templates/template-dispatch-payload.service';

@Injectable()
export class CampaignScheduler {
  private readonly logger = new Logger(CampaignScheduler.name);

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,

    @InjectRepository(Templates)
    private readonly templateRepository: Repository<Templates>,

    private readonly messageQueueService: MessageQueueService,

    private readonly templateDispatchPayload: TemplateDispatchPayloadService,
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
          recurring: true,
          recurringType: true,
          recurringDays: true,
          lastDispatchedAt: true,
          templateMapVars: true,
          company: { id: true },
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
          }
          continue;
        }

        if (this.shouldDispatchNow(campaign, now)) {
          await this.enqueueCampaign(campaign, now);
        } else {
          this.logger.warn(`[CampaignScheduler] campaign=${campaign.id} shouldDispatchNow=false`);
        }
      }
    } catch (err) {
      this.logger.error(`[CampaignScheduler] Unhandled error in checkAndDispatchCampaigns`, err);
    }
  }

  private shouldDispatchNow(campaign: Campaign, now: Date): boolean {
    const nowInTz = this.toDateTimeInZone(now, campaign.timezone);
    const scheduledAt = this.getScheduledDispatchDateTime(campaign, now);
    if (!scheduledAt || nowInTz.toMillis() < scheduledAt.toMillis()) return false;

    // Campanhas com status 'pending' foram manualmente re-enfileiradas pelo usuário
    // e devem disparar independentemente de já terem sido enviadas hoje.
    if (campaign.status === 'pending') return true;

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

  private async enqueueCampaign(campaign: Campaign, now: Date): Promise<void> {
    try {
      const scopedTemplateMapVars = this.getTemplateMapVarsForDispatchDate(
        campaign,
        now,
      );

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
      if (recipients.length > 0) {
        const { batch, dedupedRecipients } = await this.messageQueueService.enqueueBatch({
          companyId: campaign.company.id,
          templateId: campaign.template.id,
          campaignId: campaign.id,
          recipients,
          scope: 'campaign',
          scheduledAt: now,
        });
        batchId = batch.id;

        if (dedupedRecipients.length > 0) {
          const dedupSkips = dedupedRecipients.map((r) => ({
            reason: 'duplicate_dispatch_today' as const,
            number: r.number,
            name: r.name,
            detail: 'Mensagem não enviada: destinatário já recebeu disparo hoje para esta empresa.',
          }));
          await this.templateDispatchPayload.persistDispatchSkips(
            templateEntity,
            campaign.company.id,
            campaign.id,
            batchId,
            dedupSkips,
          );
        }
      }

      await this.templateDispatchPayload.persistDispatchSkips(
        templateEntity,
        campaign.company.id,
        campaign.id,
        batchId,
        skips,
      );

      if (recipients.length === 0) {
        this.logger.warn(
          `Campaign ${campaign.id} has no recipients for ${this.toDateOnly(now, campaign.timezone)}, skipping`,
        );
        await this.campaignRepository.update(campaign.id, {
          lastDispatchedAt: now,
          status: campaign.recurring ? 'queue' : 'finished',
        });
        return;
      }

      // Mark as dispatched today
      await this.campaignRepository.update(campaign.id, {
        lastDispatchedAt: now,
        status: campaign.recurring ? 'queue' : 'running',
      });

      this.logger.log(
        `Enqueued ${recipients.length} message(s) for campaign ${campaign.id}` +
          (skips.length ? `; ${skips.length} skipped (see relatório)` : ''),
      );
    } catch (err) {
      this.logger.error(`Failed to enqueue campaign ${campaign.id}`, err);
    }
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
