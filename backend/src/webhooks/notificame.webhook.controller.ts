import { Body, Controller, Logger, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RelatoryDispatchTemplate } from '../templates/entities/relatory.entity';
import { Public } from '../auth/decorators/public.decorator';
import { SkipThrottle } from '@nestjs/throttler';

type NotificaMeMessageStatus = {
  timestamp?: string;
  code?: string;
  description?: string;
  providerMessageId?: string;
};

type NotificaMeWebhookPayload = {
  type?: string;
  timestamp?: string;
  subscriptionId?: string;
  channel?: string;
  messageId?: string;
  contentIndex?: number;
  messageStatus?: NotificaMeMessageStatus;
  from?: string;
  [key: string]: unknown;
};

const STATUS_CODE_MAP: Record<string, RelatoryDispatchTemplate['status_sent']> = {
  QUEUED: 'queued',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  FAILED: 'failed',
  ERROR: 'error',
  REJECTED: 'error',
  UNDELIVERED: 'failed',
};

@SkipThrottle()
@Controller('webhooks')
export class NotificaMeWebhookController {
  private readonly logger = new Logger(NotificaMeWebhookController.name);

  constructor(
    @InjectRepository(RelatoryDispatchTemplate)
    private readonly relatoryRepository: Repository<RelatoryDispatchTemplate>,
  ) {}

  @Public()
  @Post('notificame')
  async handleNotificaMeEvent(@Body() body: NotificaMeWebhookPayload) {
    if (!body || typeof body !== 'object') {
      this.logger.warn('[Webhook] Body inválido ou ausente');
      return { received: true };
    }

    this.logger.verbose(`[Webhook] type=${body.type ?? 'unknown'} messageId=${body.messageId ?? '-'}`);

    if (body.type === 'MESSAGE') {
      return this.handleIncomingMessage(body);
    }

    if (body.type !== 'MESSAGE_STATUS') {
      this.logger.log(`[Webhook] Tipo ignorado: ${body.type}`);
      return { received: true };
    }

    const candidateMessageIds = [
      body.messageStatus?.providerMessageId,
      body.messageId,
    ]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean);
    const rawCode = String(body.messageStatus?.code ?? '').toUpperCase();

    if (candidateMessageIds.length === 0) {
      this.logger.warn(
        '[Webhook] MESSAGE_STATUS sem identificador de mensagem, ignorando',
      );
      return { received: true };
    }

    const newStatus = STATUS_CODE_MAP[rawCode];
    if (!newStatus) {
      this.logger.warn(
        `[Webhook] Status desconhecido: "${rawCode}" - ids: ${candidateMessageIds.join(', ')}`,
      );
      return { received: true };
    }

    const relatory = await this.relatoryRepository
      .createQueryBuilder('relatory')
      .where('relatory.external_message_id IN (:...candidateMessageIds)', {
        candidateMessageIds,
      })
      .getOne();

    if (!relatory) {
      this.logger.warn(
        `[Webhook] Nenhum relatorio com external_message_id para ids: ${candidateMessageIds.join(', ')}`,
      );
      return { received: true };
    }

    const isResponse = newStatus === 'delivered' || newStatus === 'read';

    await this.relatoryRepository.update(relatory.id, {
      status_sent: newStatus,
      ...(isResponse && !relatory.response
        ? { response: true, response_at: new Date() }
        : {}),
    });

    const isFailed = newStatus === 'error' || newStatus === 'failed';
    const logFn = isFailed ? this.logger.warn.bind(this.logger) : this.logger.log.bind(this.logger);
    logFn(
      `[Webhook] Mensagem ${String(relatory.external_message_id ?? candidateMessageIds[0]).slice(0, 8)} -> ${rawCode} (relatorio ${relatory.id.slice(0, 8)})${isFailed ? ` | descricao: ${body.messageStatus?.description ?? 'sem descricao'}` : ''}`,
    );

    return { received: true };
  }

  private async handleIncomingMessage(body: NotificaMeWebhookPayload) {
    const rawFrom = String(body.from ?? '').replace(/\D/g, '');
    const channelContextIds = this.extractChannelContextIds(body);

    if (!rawFrom) {
      this.logger.warn('[Webhook] MESSAGE sem campo "from", ignorando');
      return { received: true };
    }

    if (channelContextIds.length === 0) {
      this.logger.warn(
        `[Webhook] MESSAGE de ${rawFrom} sem contexto de canal/subscription, ignorando para evitar match cruzado entre empresas`,
      );
      return { received: true };
    }

    const relatory = await this.relatoryRepository
      .createQueryBuilder('relatory')
      .innerJoin('relatory.company', 'company')
      .where('relatory.number = :number', { number: rawFrom })
      .andWhere('relatory.response = false')
      .andWhere('company.canalId_notificameHub IN (:...channelContextIds)', {
        channelContextIds,
      })
      .orderBy('relatory.date_dispatch', 'DESC')
      .getOne();

    if (!relatory) {
      this.logger.verbose(
        `[Webhook] MESSAGE de ${rawFrom} - nenhum relatorio pendente de resposta para os canais ${channelContextIds.join(', ')}`,
      );
      return { received: true };
    }

    await this.relatoryRepository.update(relatory.id, {
      response: true,
      response_at: new Date(),
    });

    this.logger.log(
      `[Webhook] Resposta recebida de ${rawFrom} - relatorio ${relatory.id.slice(0, 8)} marcado como respondido`,
    );

    return { received: true };
  }

  private extractChannelContextIds(body: NotificaMeWebhookPayload): string[] {
    const identifiers = [body.channel, body.subscriptionId]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean);

    return [...new Set(identifiers)];
  }
}
