import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DateTime } from 'luxon';
import { In, Repository } from 'typeorm';
import { Campaign } from '../campaigns/entities/campanhas.entity';
import { MessageQueueService } from './message-queue.service';
import type { MessageQueuePayload } from './entities/message-queue.entity';

@Injectable()
export class CampaignScheduler {
  private readonly logger = new Logger(CampaignScheduler.name);

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,

    private readonly messageQueueService: MessageQueueService,
  ) {}

  /**
   * Runs every minute, checks for campaigns whose dispatch window has arrived,
   * and enqueues their messages.
   */
  @Cron('* * * * *')
  async checkAndDispatchCampaigns(): Promise<void> {
    const now = new Date();

    const campaigns = await this.campaignRepository.find({
      where: {
        isEnabled: true,
        status: In(['queue', 'pending']),
      },
      relations: ['company', 'template'],
      select: {
        id: true,
        startDate: true,
        endDate: true,
        dispatchTime: true,
        timezone: true,
        recurring: true,
        lastDispatchedAt: true,
        templateMapVars: true,
        company: { id: true },
        template: { id: true },
      },
    });

    for (const campaign of campaigns) {
      if (!this.isCampaignActiveOnDate(campaign, now)) {
        continue;
      }

      if (this.shouldDispatchNow(campaign, now)) {
        await this.enqueueCampaign(campaign, now);
      }
    }
  }

  private shouldDispatchNow(campaign: Campaign, now: Date): boolean {
    const nowInTz = this.toDateTimeInZone(now, campaign.timezone);
    const scheduledAt = this.getScheduledDispatchDateTime(campaign, now);
    if (!scheduledAt || nowInTz.toMillis() < scheduledAt.toMillis()) return false;

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
      const recipients: MessageQueuePayload[] = (
        campaign.templateMapVars ?? []
      ).map((v) => ({
        number: String(v.whatsapp ?? ''),
        name: String(v.nome_cliente ?? ''),
        components: this.buildComponents(v),
      }));

      if (recipients.length === 0) {
        this.logger.warn(`Campaign ${campaign.id} has no recipients, skipping`);
        return;
      }

      await this.messageQueueService.enqueueBatch({
        companyId: campaign.company.id,
        templateId: campaign.template.id,
        campaignId: campaign.id,
        recipients,
        scope: 'campaign',
        scheduledAt: now,
      });

      // Mark as dispatched today
      await this.campaignRepository.update(campaign.id, {
        lastDispatchedAt: now,
        status: campaign.recurring ? 'queue' : 'running',
      });

      this.logger.log(
        `Enqueued ${recipients.length} messages for campaign ${campaign.id}`,
      );
    } catch (err) {
      this.logger.error(`Failed to enqueue campaign ${campaign.id}`, err);
    }
  }

  private buildComponents(vars: Record<string, unknown>): MessageQueuePayload['components'] {
    // Extract text parameters from template vars into WhatsApp component format.
    // The actual component structure was saved in templateMapVars by the frontend.
    const components = this.normalizeStoredComponents(vars['components']);
    if (components.length) return components;

    // Fallback: build a simple BODY component with non-empty string values
    const parameters = Object.entries(vars)
      .filter(([k, v]) => !['clientId', 'cnpj_cpf', 'whatsapp', 'nome_cliente'].includes(k) && typeof v === 'string' && v)
      .map(([, v]) => ({ type: 'text', text: String(v) }));

    return parameters.length ? [{ type: 'BODY', parameters }] : [];
  }

  private normalizeStoredComponents(
    components: unknown,
  ): MessageQueuePayload['components'] {
    if (Array.isArray(components)) {
      return components as MessageQueuePayload['components'];
    }

    if (
      components &&
      typeof components === 'object' &&
      Array.isArray((components as { components?: unknown }).components)
    ) {
      return (components as { components: MessageQueuePayload['components'] })
        .components;
    }

    if (typeof components === 'string') {
      try {
        return this.normalizeStoredComponents(JSON.parse(components));
      } catch {
        return [];
      }
    }

    return [];
  }

  private isCampaignActiveOnDate(campaign: Campaign, now: Date): boolean {
    const todayInTimezone = this.toDateOnly(now, campaign.timezone);
    const startDate = this.toDateOnly(campaign.startDate, campaign.timezone);
    const endDate = this.toDateOnly(campaign.endDate, campaign.timezone);

    const withinRange = todayInTimezone >= startDate && todayInTimezone <= endDate;
    if (!withinRange) return false;

    if (campaign.recurringType === 'monthly_days') {
      const dayOfMonth = this.toDateTimeInZone(now, campaign.timezone).day;
      return (campaign.recurringDays ?? []).includes(dayOfMonth);
    }

    return true;
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
