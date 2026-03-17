import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
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
    const today = this.toDateOnly(now);

    const campaigns = await this.campaignRepository.find({
      where: {
        isEnabled: true,
        status: 'queue',
        startDate: LessThanOrEqual(new Date(`${today}T23:59:59`)),
        endDate: MoreThanOrEqual(new Date(`${today}T00:00:00`)),
      },
      relations: ['company', 'template'],
      select: {
        id: true,
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
      if (this.shouldDispatchNow(campaign, now)) {
        await this.enqueueCampaign(campaign, now);
      }
    }
  }

  private shouldDispatchNow(campaign: Campaign, now: Date): boolean {
    const [hour, minute] = campaign.dispatchTime.split(':').map(Number);

    // Convert current time to campaign timezone
    const nowInTz = new Date(
      now.toLocaleString('en-US', { timeZone: campaign.timezone }),
    );

    const currentHour = nowInTz.getHours();
    const currentMinute = nowInTz.getMinutes();

    if (currentHour !== hour || currentMinute !== minute) return false;

    // Avoid re-dispatching if already sent today
    if (campaign.lastDispatchedAt) {
      const lastDate = this.toDateOnly(campaign.lastDispatchedAt);
      const todayStr = this.toDateOnly(now);
      if (lastDate === todayStr) return false;
    }

    return true;
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
    const components = vars['components'];
    if (Array.isArray(components)) return components as MessageQueuePayload['components'];

    // Fallback: build a simple BODY component with non-empty string values
    const parameters = Object.entries(vars)
      .filter(([k, v]) => !['clientId', 'cnpj_cpf', 'whatsapp', 'nome_cliente'].includes(k) && typeof v === 'string' && v)
      .map(([, v]) => ({ type: 'text', text: String(v) }));

    return parameters.length ? [{ type: 'BODY', parameters }] : [];
  }

  private toDateOnly(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
