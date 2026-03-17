import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ) {}

  async enqueueBatch(params: EnqueueBatchParams): Promise<DispatchBatch> {
    const scheduledAt = params.scheduledAt ?? new Date();

    const batch = await this.batchRepository.save({
      company: { id: params.companyId },
      campaign: params.campaignId ? { id: params.campaignId } : null,
      companyId: params.companyId,
      campaignId: params.campaignId ?? null,
      templateId: params.templateId,
      status: 'queued' as const,
      totalRecipients: params.recipients.length,
      processedRecipients: 0,
      scope: params.scope,
    });

    const jobs = params.recipients.map((recipient) => ({
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

    return batch;
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
}
