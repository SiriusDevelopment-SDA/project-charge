import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign } from '../campaigns/entities/campanhas.entity';
import { MessageQueue } from './entities/message-queue.entity';
import { DispatchBatch } from './entities/dispatch-batch.entity';
import type { MessageQueuePayload } from './entities/message-queue.entity';

type EnqueueBatchParams = {
  companyId: string;
  templateId: string;
  campaignId?: string | null;
  recipients: MessageQueuePayload[];
  scope: 'manual' | 'campaign';
  scheduledAt?: Date;
  disableDailyDedup?: boolean;
};

type ClaimedJob = {
  id: string;
  companyId: string;
  templateId: string;
  campaignId: string | null;
  batchId: string | null;
  payload: MessageQueuePayload;
};

const BATCH_INSERT_SIZE = 500;
const MAX_ATTEMPTS = 3;

@Injectable()
export class MessageQueueService {
  private readonly logger = new Logger(MessageQueueService.name);

  constructor(
    @InjectRepository(MessageQueue)
    private readonly queueRepository: Repository<MessageQueue>,

    @InjectRepository(DispatchBatch)
    private readonly batchRepository: Repository<DispatchBatch>,

    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
  ) {}

  async enqueueBatch(params: EnqueueBatchParams): Promise<{ batch: DispatchBatch; skipped: number }> {
    const scheduledAt = params.scheduledAt ?? new Date();
    let uniqueRecipients = params.recipients;
    let deduped = 0;

    if (!params.disableDailyDedup) {
      // Deduplicação: remove destinatários cujo telefone já foi despachado hoje para a mesma empresa
      const todayStart = new Date(scheduledAt);
      todayStart.setHours(0, 0, 0, 0);

      const alreadyQueued = await this.queueRepository
        .createQueryBuilder('q')
        .select("q.payload->>'number'", 'number')
        .where('q."companyId" = :companyId', { companyId: params.companyId })
        .andWhere('q."scheduledAt" >= :todayStart', { todayStart })
        .andWhere("q.status != 'failed'")
        .getRawMany<{ number: string }>();

      const alreadyQueuedSet = new Set(alreadyQueued.map((r) => r.number));
      uniqueRecipients = params.recipients.filter(
        (r) => !alreadyQueuedSet.has(r.number),
      );

      deduped = params.recipients.length - uniqueRecipients.length;
      if (deduped > 0) {
        this.logger.log(
          `Deduplication: ${deduped} recipient(s) already dispatched today for company ${params.companyId} — skipped.`,
        );
      }
    }

    const batch = await this.batchRepository.save({
      company: { id: params.companyId },
      campaign: params.campaignId ? { id: params.campaignId } : null,
      companyId: params.companyId,
      campaignId: params.campaignId ?? null,
      templateId: params.templateId,
      status: 'queued' as const,
      totalRecipients: uniqueRecipients.length,
      processedRecipients: 0,
      scope: params.scope,
    });

    const jobs = uniqueRecipients.map((recipient) => ({
      company: { id: params.companyId },
      template: { id: params.templateId },
      campaign: params.campaignId ? { id: params.campaignId } : null,
      batch: { id: batch.id },
      companyId: params.companyId,
      templateId: params.templateId,
      campaignId: params.campaignId ?? null,
      batchId: batch.id,
      payload: recipient,
      status: 'pending' as const,
      attempts: 0,
      scheduledAt,
    }));

    for (let i = 0; i < jobs.length; i += BATCH_INSERT_SIZE) {
      await this.queueRepository.save(jobs.slice(i, i + BATCH_INSERT_SIZE));
    }

    return { batch, skipped: deduped };
  }

  /**
   * Returns all company IDs that have pending jobs due for processing.
   * Called once per worker tick to know which companies need attention.
   */
  async getCompaniesWithPendingJobs(): Promise<string[]> {
    // NOW() AT TIME ZONE 'UTC' garante comparação correta independente
    // do timezone configurado no PostgreSQL (evita falso "job no futuro"
    // quando o banco está em America/Sao_Paulo e o Node envia datas em UTC).
    const rows: Array<{ companyId: string }> =
      await this.queueRepository.manager.query(
        `SELECT DISTINCT "companyId"
         FROM message_queue
         WHERE status = 'pending'
           AND "scheduledAt" <= (NOW() AT TIME ZONE 'UTC')
           AND attempts < $1`,
        [MAX_ATTEMPTS],
      );
    return rows.map((r) => r.companyId);
  }

  /**
   * Claims up to `limit` jobs for a specific company using FOR UPDATE SKIP LOCKED.
   * Each company gets its own independent slot pool — 15 msgs/s per company.
   */
  async claimBatchForCompany(
    companyId: string,
    limit = 15,
  ): Promise<ClaimedJob[]> {
    return this.queueRepository.manager.transaction(async (em) => {
      const rows: ClaimedJob[] = await em.query(
        `SELECT id, "companyId", "templateId", "campaignId", "batchId", payload
         FROM message_queue
         WHERE status = 'pending'
           AND "scheduledAt" <= (NOW() AT TIME ZONE 'UTC')
           AND "companyId" = $1
           AND attempts < $2
         ORDER BY "scheduledAt" ASC, "createdAt" ASC
         LIMIT $3
         FOR UPDATE SKIP LOCKED`,
        [companyId, MAX_ATTEMPTS, limit],
      );

      if (rows.length === 0) return [];

      const ids = rows.map((r) => r.id);
      await em.query(
        `UPDATE message_queue
         SET status = 'processing', attempts = attempts + 1
         WHERE id = ANY($1)`,
        [ids],
      );

      return rows;
    });
  }

  async markSent(jobId: string): Promise<void> {
    await this.queueRepository.update(jobId, {
      status: 'sent',
      processedAt: new Date(),
      errorMessage: null,
    });
  }

  async markFailed(jobId: string, errorMessage: string): Promise<void> {
    const job = await this.queueRepository.findOne({
      where: { id: jobId },
      select: { attempts: true },
    });

    // Re-queue if under max attempts, otherwise mark as permanently failed
    const isExhausted = (job?.attempts ?? MAX_ATTEMPTS) >= MAX_ATTEMPTS;

    await this.queueRepository.update(jobId, {
      status: isExhausted ? 'failed' : 'pending',
      processedAt: isExhausted ? new Date() : null,
      errorMessage,
    });
  }

  async updateBatchProgress(batchId: string): Promise<void> {
    const result: Array<{ total: string; sent: string; failed: string }> =
      await this.queueRepository.manager.query(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'sent'   THEN 1 ELSE 0 END) AS sent,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
         FROM message_queue
         WHERE "batchId" = $1`,
        [batchId],
      );

    const { total, sent, failed } = result[0] ?? { total: '0', sent: '0', failed: '0' };
    const totalN = parseInt(total);
    const sentN = parseInt(sent);
    const failedN = parseInt(failed);
    const processed = sentN + failedN;

    let status: DispatchBatch['status'] = 'processing';
    if (processed >= totalN && totalN > 0) {
      if (failedN === 0) status = 'completed';
      else if (sentN === 0) status = 'failed';
      else status = 'partial';
    }

    await this.batchRepository.update(batchId, {
      processedRecipients: processed,
      status,
    });

    if (['completed', 'partial', 'failed'].includes(status)) {
      await this.syncCampaignStatusFromBatch(batchId);
    }
  }

  private async syncCampaignStatusFromBatch(batchId: string): Promise<void> {
    const batch = await this.batchRepository.findOne({
      where: { id: batchId },
      relations: ['campaign'],
      select: {
        id: true,
        campaignId: true,
        campaign: {
          id: true,
          recurring: true,
        },
      },
    });

    if (!batch?.campaignId) {
      return;
    }

    await this.campaignRepository.update(batch.campaignId, {
      status: batch.campaign?.recurring ? 'queue' : 'finished',
    });
  }

  async getLatestBatchByAccount(
    account: string,
    scope?: 'manual' | 'campaign',
  ): Promise<DispatchBatch | null> {
    const qb = this.batchRepository
      .createQueryBuilder('batch')
      .innerJoin('batch.company', 'company')
      .where('company.account_chatwoot = :account', { account })
      .orderBy('batch.createdAt', 'DESC')
      .limit(1);

    if (scope) {
      qb.andWhere('batch.scope = :scope', { scope });
    }

    return qb.getOne();
  }

  async getBatchById(batchId: string): Promise<DispatchBatch | null> {
    return this.batchRepository.findOne({ where: { id: batchId } });
  }

  async getBatchCounts(batchId: string): Promise<{ sent: number; failed: number }> {
    const result: Array<{ sent: string; failed: string }> =
      await this.queueRepository.manager.query(
        `SELECT
           SUM(CASE WHEN status = 'sent'   THEN 1 ELSE 0 END) AS sent,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
         FROM message_queue
         WHERE "batchId" = $1`,
        [batchId],
      );
    const row = result[0] ?? { sent: '0', failed: '0' };
    return {
      sent: parseInt(row.sent ?? '0'),
      failed: parseInt(row.failed ?? '0'),
    };
  }

  async reconcileCampaignStatuses(account?: string): Promise<string[]> {
    const params: string[] = [];
    const accountFilter = account
      ? ' AND comp.account_chatwoot = $1'
      : '';

    if (account) {
      params.push(account);
    }

    const rows: Array<{ campaignId: string; recurring: boolean }> =
      await this.batchRepository.manager.query(
        `SELECT DISTINCT b."campaignId" AS "campaignId", c.recurring AS recurring
         FROM dispatch_batch b
         INNER JOIN campaigns c ON c.id = b."campaignId"
         INNER JOIN company comp ON comp.id = c.company
         WHERE b.scope = 'campaign'
           AND b.status IN ('completed', 'partial', 'failed')
           AND c.status = 'running'
           ${accountFilter}
           AND NOT EXISTS (
             SELECT 1
             FROM message_queue mq
             WHERE mq."campaignId" = b."campaignId"
               AND mq.status IN ('pending', 'processing')
           )`,
        params,
      );

    for (const row of rows) {
      await this.campaignRepository.update(row.campaignId, {
        status: row.recurring ? 'queue' : 'finished',
      });
    }

    return rows.map((row) => row.campaignId);
  }
}
