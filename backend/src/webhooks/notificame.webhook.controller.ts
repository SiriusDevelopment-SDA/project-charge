import { Body, Controller, Logger, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RelatoryDispatchTemplate } from '../templates/entities/relatory.entity';

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

@Controller('webhooks')
export class NotificaMeWebhookController {
  private readonly logger = new Logger(NotificaMeWebhookController.name);

  constructor(
    @InjectRepository(RelatoryDispatchTemplate)
    private readonly relatoryRepository: Repository<RelatoryDispatchTemplate>,
  ) {}

  @Post('notificame')
  async handleNotificaMeEvent(@Body() body: NotificaMeWebhookPayload) {
    this.logger.verbose(`[Webhook] Payload recebido: ${JSON.stringify(body)}`);

    if (body.type === 'MESSAGE') {
      return this.handleIncomingMessage(body);
    }

    if (body.type !== 'MESSAGE_STATUS') {
      this.logger.verbose(`[Webhook] Tipo ignorado: ${body.type}`);
      return { received: true };
    }

    const messageId = body.messageId;
    const rawCode = String(body.messageStatus?.code ?? '').toUpperCase();

    if (!messageId) {
      this.logger.warn('[Webhook] MESSAGE_STATUS sem messageId, ignorando');
      return { received: true };
    }

    const newStatus = STATUS_CODE_MAP[rawCode];
    if (!newStatus) {
      this.logger.warn(
        `[Webhook] Status desconhecido: "${rawCode}" — messageId: ${messageId}`,
      );
      return { received: true };
    }

    const relatory = await this.relatoryRepository.findOne({
      where: { external_message_id: messageId },
    });

    if (!relatory) {
      this.logger.warn(
        `[Webhook] Nenhum relatorio com external_message_id: ${messageId}`,
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

    this.logger.log(
      `[Webhook] Mensagem ${messageId.slice(0, 8)} → ${rawCode} (relatorio ${relatory.id.slice(0, 8)})`,
    );

    return { received: true };
  }

  private async handleIncomingMessage(body: NotificaMeWebhookPayload) {
    const rawFrom = String(body.from ?? '').replace(/\D/g, '');

    if (!rawFrom) {
      this.logger.warn('[Webhook] MESSAGE sem campo "from", ignorando');
      return { received: true };
    }

    const relatory = await this.relatoryRepository.findOne({
      where: { number: rawFrom, response: false },
      order: { date_dispatch: 'DESC' },
    });

    if (!relatory) {
      this.logger.verbose(
        `[Webhook] MESSAGE de ${rawFrom} — nenhum relatorio pendente de resposta`,
      );
      return { received: true };
    }

    await this.relatoryRepository.update(relatory.id, {
      response: true,
      response_at: new Date(),
    });

    this.logger.log(
      `[Webhook] Resposta recebida de ${rawFrom} — relatorio ${relatory.id.slice(0, 8)} marcado como respondido`,
    );

    return { received: true };
  }
}
