import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessageQueueService } from './message-queue.service';
import { Templates } from '../templates/entities/templatesMeta';
import { RelatoryDispatchTemplate } from '../templates/entities/relatory.entity';
import type { MessageQueuePayload } from './entities/message-queue.entity';
import type { NotificameChannel } from '../companies/entities/notificame-channel.type';
import {
  buildDispatchComponentsMaped,
  extractExternalMessageId,
  isFailedDispatch,
} from './dispatch-relatory.util';

const WORKER_INTERVAL_MS = 1000;
const BATCH_SIZE = 15;

type TemplateWithCompany = Templates & {
  company: {
    id: string;
    canalId_notificameHub: NotificameChannel[];
    // X-Api-Token compartilhado da conta NotificaMe (uma credencial por empresa).
    token_notificameHub: string;
  };
};

@Injectable()
export class MessageQueueWorker implements OnModuleInit {
  private readonly logger = new Logger(MessageQueueWorker.name);
  private readonly baseUrl = 'https://api.notificame.com.br/v2';
  private isProcessing = false;
  private tickCount = 0;

  // In-memory template cache to avoid N+1 queries per tick
  private readonly templateCache = new Map<string, TemplateWithCompany>();

  constructor(
    private readonly messageQueueService: MessageQueueService,

    @InjectRepository(Templates)
    private readonly templateRepository: Repository<Templates>,

    @InjectRepository(RelatoryDispatchTemplate)
    private readonly relatoryRepository: Repository<RelatoryDispatchTemplate>,
  ) {}

  async onModuleInit() {
    const stuck = await this.messageQueueService.resetStuckProcessingJobs();
    if (stuck > 0) {
      this.logger.warn(`[Recovery] ${stuck} job(s) presos em 'processing' resetados para 'pending'`);
    }
    await this.messageQueueService.reconcileCampaignStatuses();
    this.logger.log('MessageQueueWorker inicializado — intervalo: 1s');
  }

  @Interval(WORKER_INTERVAL_MS)
  async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.tickCount++;

    try {
      // Each company gets its own independent 15 msgs/s slot.
      // Companies A and B run fully in parallel — one never blocks the other.
      const companyIds =
        await this.messageQueueService.getCompaniesWithPendingJobs();

      if (companyIds.length === 0) {
        // Log a cada 30 ticks (~30s) para confirmar que o worker está vivo
        if (this.tickCount % 30 === 0) {
          this.logger.verbose(`Worker ativo — sem jobs pendentes (tick #${this.tickCount})`);
        }
        return;
      }

      this.logger.log(
        `[Tick #${this.tickCount}] ${companyIds.length} empresa(s) com jobs pendentes`,
      );

      await Promise.all(companyIds.map((id) => this.processCompany(id)));
    } catch (err) {
      this.logger.error(`Worker tick error (tick #${this.tickCount})`, err);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processCompany(companyId: string): Promise<void> {
    const jobs = await this.messageQueueService.claimBatchForCompany(
      companyId,
      BATCH_SIZE,
    );

    if (jobs.length === 0) return;

    this.logger.log(
      `[Empresa ${companyId.slice(0, 8)}] Processando ${jobs.length} mensagem(ns)`,
    );

    await Promise.all(jobs.map((job) => this.processJob(job)));
  }

  private async processJob(job: {
    id: string;
    companyId: string;
    templateId: string;
    campaignId: string | null;
    channelId: string | null;
    batchId: string | null;
    payload: MessageQueuePayload;
  }): Promise<void> {
    try {
      const template = await this.getTemplate(job.templateId);

      // MC2: seleciona o canal escolhido (campanha/disparo) pelo id; se não
      // vier channelId ou não existir mais na empresa, faz fallback para o
      // primeiro canal do array (comportamento MC1).
      const channel = this.selectChannel(
        template.company.canalId_notificameHub,
        job.channelId,
      );

      const apiToken = template.company.token_notificameHub;
      if (!channel?.id || !apiToken) {
        throw new Error('Empresa sem integracao NotificaMe configurada');
      }

      const safeComponents = Array.isArray(job.payload.components)
        ? job.payload.components
        : [];

      const normalizedNumber = (() => {
        const digits = job.payload.number.replace(/\D/g, '');
        if (digits.startsWith('55') && digits.length >= 12) return digits;
        return `55${digits}`;
      })();

      const requestBody = {
        from: channel.id,
        to: normalizedNumber,
        contents: [
          {
            type: 'template',
            template: {
              name: template.name,
              language: { code: template.language },
              components: safeComponents,
            },
          },
        ],
        message_activity_sharing: true,
        message_send_ttl_seconds: 3600,
      };

      this.logger.verbose(
        `[Job ${job.id.slice(0, 8)}] → ${normalizedNumber} template=${template.name}`,
      );
      const response = await fetch(
        `${this.baseUrl}/channels/whatsapp/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Token': apiToken,
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(15_000),
        },
      );

      let result: Record<string, unknown> = {};
      try {
        result = await response.json();
      } catch {
        // Non-JSON response body — treat as error
      }

      const status: RelatoryDispatchTemplate['status_sent'] = response.ok
        ? ((result.status as RelatoryDispatchTemplate['status_sent']) ?? 'queued')
        : 'error';

      // Falha = HTTP não-ok OU HTTP 200 com `status: "error"` no corpo (a Meta
      // rejeitou a mensagem na submissão). Antes, esse 2º caso caía no log de
      // "OK" e o motivo se perdia — o relatório só guardava status='error'.
      const failed = isFailedDispatch(response.ok, status);

      if (!response.ok) {
        this.logger.warn(
          `[Job ${job.id.slice(0, 8)}] NotificaMe HTTP ${response.status} — resposta: ${JSON.stringify(result)} — payload enviado: ${JSON.stringify(requestBody)}`,
        );
      } else if (failed) {
        this.logger.warn(
          `[Job ${job.id.slice(0, 8)}] NotificaMe respondeu HTTP ${response.status} com status="error" — resposta: ${JSON.stringify(result)}`,
        );
      } else {
        // Loga a resposta CRUA completa para descobrir qual campo casa com o
        // `messageId`/`providerMessageId` do webhook MESSAGE_STATUS. Hoje o
        // status fica preso em "queued" por desencontro de id; este log permite
        // confirmar em produção o campo correto sem novo deploy só pra depurar.
        this.logger.log(
          `[Job ${job.id.slice(0, 8)}] NotificaMe OK ${response.status} — resposta: ${JSON.stringify(result)}`,
        );
      }

      // Tenta extrair o melhor id para casar com o webhook de status; cai em
      // result.id (comportamento histórico) quando nenhum candidato existe.
      const externalMessageId = extractExternalMessageId(result);

      const mappedValues = safeComponents
        .flatMap((c) => (c.parameters ?? []))
        .map((p: Record<string, unknown>) => (p.text ?? null) as string | null)
        .filter(Boolean) as (string | null)[];

      // Em falha, grava o motivo (corpo da resposta da NotificaMe) no próprio
      // relatório; em sucesso, mantém só os valores enviados (comportamento
      // histórico). Ver dispatch-relatory.util.ts.
      const componentsMaped = buildDispatchComponentsMaped({
        isError: failed,
        httpStatus: response.status,
        notificameResponse: result,
        mappedValues,
      });

      await this.relatoryRepository.save({
        date_dispatch: new Date(),
        external_message_id: externalMessageId,
        status_sent: status,
        template: { id: template.id },
        name: job.payload.name ?? job.payload.number,
        number: job.payload.number,
        components_maped: componentsMaped,
        company: { id: job.companyId },
        campaign: job.campaignId ? { id: job.campaignId } : null,
        batchId: job.batchId ?? null,
        message: template.message ?? '',
      });

      await this.messageQueueService.markSent(job.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Job ${job.id} failed: ${message}`);
      await this.messageQueueService.markFailed(job.id, message);
    } finally {
      if (job.batchId) {
        await this.messageQueueService.updateBatchProgress(job.batchId);
      }
    }
  }

  /**
   * MC2: dado o array de canais da empresa e o channelId escolhido, retorna o
   * canal correspondente. Quando channelId é null/vazio ou não bate com nenhum
   * canal, faz fallback para o primeiro canal (comportamento MC1).
   */
  private selectChannel(
    channels: NotificameChannel[] | null | undefined,
    channelId: string | null | undefined,
  ): NotificameChannel | undefined {
    if (!Array.isArray(channels) || channels.length === 0) {
      return undefined;
    }

    if (channelId) {
      const match = channels.find((channel) => channel.id === channelId);
      if (match) return match;
    }

    return channels[0];
  }

  private async getTemplate(templateId: string): Promise<TemplateWithCompany> {
    const cached = this.templateCache.get(templateId);
    if (cached) return cached;

    const template = await this.templateRepository.findOne({
      where: { id: templateId },
      relations: { company: true },
      select: {
        id: true,
        name: true,
        language: true,
        category: true,
        message: true,
        company: {
          id: true,
          canalId_notificameHub: true,
          token_notificameHub: true,
        },
      },
    });

    if (!template) throw new Error(`Template ${templateId} nao encontrado`);

    // Cache for 60 seconds then evict
    this.templateCache.set(templateId, template as TemplateWithCompany);
    setTimeout(() => this.templateCache.delete(templateId), 60_000);

    return template as TemplateWithCompany;
  }
}
