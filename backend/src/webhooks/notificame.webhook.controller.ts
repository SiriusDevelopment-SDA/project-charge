import { Body, Controller, Logger, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RelatoryDispatchTemplate } from '../templates/entities/relatory.entity';
import { ChatSession } from '../chatwoot/entities/chat-session.entity';
import { Company } from '../companies/entities/companies';
import { Public } from '../auth/decorators/public.decorator';
import { ChatGateway } from '../realtime/chat.gateway';
import { RedisService } from '../redis/redis.service';

type NotificaMeMessageContent = {
  type: string;
  text?: string;
  [key: string]: unknown;
};

type NotificaMeMessagePayload = {
  id?: string;
  from?: string;
  to?: string;
  contents?: NotificaMeMessageContent[];
  timestamp?: string;
  visitor?: { name?: string; [key: string]: unknown };
  [key: string]: unknown;
};

type NotificaMeMessageStatus = {
  timestamp?: string;
  code?: string;
  description?: string;
  providerMessageId?: string;
};

type NotificaMeWebhookPayload = {
  type?: string;
  id?: string;
  timestamp?: string;
  subscriptionId?: string;
  channel?: string;
  direction?: string;
  messageId?: string;
  contentIndex?: number;
  messageStatus?: NotificaMeMessageStatus;
  from?: string;
  message?: NotificaMeMessagePayload;
  providerMessageId?: string;
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
    @InjectRepository(ChatSession)
    private readonly chatSessionRepository: Repository<ChatSession>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly chatGateway: ChatGateway,
    private readonly redisService: RedisService,
  ) {}

  @Public()
  @Post('notificame')
  async handleNotificaMeEvent(@Body() body: NotificaMeWebhookPayload) {
    if (!body || typeof body !== 'object') {
      this.logger.warn('[Webhook] Body inválido ou ausente');
      return { received: true };
    }

    this.logger.verbose(`[Webhook] type=${body.type ?? 'unknown'} id=${body.id ?? '-'}`);

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
      this.logger.warn('[Webhook] MESSAGE_STATUS sem identificador de mensagem, ignorando');
      return { received: true };
    }

    const newStatus = STATUS_CODE_MAP[rawCode];
    if (!newStatus) {
      this.logger.warn(`[Webhook] Status desconhecido: "${rawCode}" - ids: ${candidateMessageIds.join(', ')}`);
      return { received: true };
    }

    const relatory = await this.relatoryRepository
      .createQueryBuilder('relatory')
      .where('relatory.external_message_id IN (:...candidateMessageIds)', { candidateMessageIds })
      .getOne();

    if (!relatory) {
      this.logger.warn(`[Webhook] Nenhum relatorio com external_message_id para ids: ${candidateMessageIds.join(', ')}`);
      return { received: true };
    }

    const isResponse = newStatus === 'delivered' || newStatus === 'read';

    await this.relatoryRepository.update(relatory.id, {
      status_sent: newStatus,
      ...(isResponse && !relatory.response ? { response: true, response_at: new Date() } : {}),
    });

    const isFailed = newStatus === 'error' || newStatus === 'failed';
    const logFn = isFailed ? this.logger.warn.bind(this.logger) : this.logger.log.bind(this.logger);
    logFn(
      `[Webhook] Mensagem ${String(relatory.external_message_id ?? candidateMessageIds[0]).slice(0, 8)} -> ${rawCode} (relatorio ${relatory.id.slice(0, 8)})${isFailed ? ` | descricao: ${body.messageStatus?.description ?? 'sem descricao'}` : ''}`,
    );

    return { received: true };
  }

  private async handleIncomingMessage(body: NotificaMeWebhookPayload) {
    const msgPayload = body.message;
    const rawFrom = String(msgPayload?.from ?? body.from ?? '').replace(/\D/g, '');
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

    // Marca relatorio como respondido.
    // canalId_notificameHub agora é jsonb (array de canais); resolvemos a
    // empresa cujo array contém algum dos ids de contexto do webhook.
    const channelMatch = this.buildChannelContainmentClause(channelContextIds);
    const relatory = await this.relatoryRepository
      .createQueryBuilder('relatory')
      .innerJoinAndSelect('relatory.company', 'company')
      .where('relatory.number = :number', { number: rawFrom })
      .andWhere('relatory.response = false')
      .andWhere(channelMatch.clause, channelMatch.params)
      .orderBy('relatory.date_dispatch', 'DESC')
      .getOne();

    if (relatory) {
      await this.relatoryRepository.update(relatory.id, {
        response: true,
        response_at: new Date(),
      });
      this.logger.log(
        `[Webhook] Resposta recebida de ${rawFrom} - relatorio ${relatory.id.slice(0, 8)} marcado como respondido`,
      );
    } else {
      this.logger.verbose(
        `[Webhook] MESSAGE de ${rawFrom} - nenhum relatorio pendente de resposta para os canais ${channelContextIds.join(', ')}`,
      );
    }

    // Extrai conteudo da mensagem
    const contents = Array.isArray(msgPayload?.contents) ? msgPayload.contents : [];
    const textContent = contents.find((c) => c.type === 'text')?.text ?? null;
    const senderName = String(msgPayload?.visitor?.name ?? '').trim() || rawFrom;
    const messageId = String(msgPayload?.id ?? body.id ?? '');
    const createdAt = String(msgPayload?.timestamp ?? body.timestamp ?? new Date().toISOString());

    if (!textContent) {
      this.logger.verbose(`[Webhook] MESSAGE de ${rawFrom} sem conteudo de texto, ignorando emissao`);
      return { received: true };
    }

    // Resolve empresa: primeiro pelo relatorio, depois pelo canal diretamente
    let account = String((relatory?.company as any)?.account_chatwoot ?? '').trim();
    let companyId = String((relatory?.company as any)?.id ?? '').trim();

    if (!account || !companyId) {
      const company = await this.companyRepository
        .createQueryBuilder('company')
        .where(channelMatch.clause, channelMatch.params)
        .getOne();

      account = String(company?.account_chatwoot ?? '').trim();
      companyId = String(company?.id ?? '').trim();
    }

    if (!account || !companyId) {
      this.logger.warn(`[Webhook] Nao foi possivel resolver account/company para phone ${rawFrom}`);
      return { received: true };
    }

    const session = await this.chatSessionRepository
      .createQueryBuilder('session')
      .where('session.companyId = :companyId', { companyId })
      .andWhere(
        '(session.normalizedPhone = :phone OR session.phone = :phone)',
        { phone: rawFrom },
      )
      .andWhere('session.status IN (:...statuses)', { statuses: ['open', 'pending'] })
      .orderBy('session.lastExternalUpdatedAt', 'DESC')
      .getOne();

    if (!session) {
      this.logger.verbose(`[Webhook] Nenhuma sessao ativa encontrada para phone ${rawFrom}`);
      return { received: true };
    }

    // Limpa cache Redis das mensagens desta conversa
    void this.redisService.delByPrefix(`chatwoot:${account}:msg:`);

    // Emite para o frontend com dados completos da mensagem
    this.chatGateway.emitChatSync(account, {
      conversationId: session.externalConversationId,
      message: {
        id: messageId,
        content: textContent,
        senderType: 'contact',
        senderName,
        createdAt,
      },
    });

    return { received: true };
  }

  private extractChannelContextIds(body: NotificaMeWebhookPayload): string[] {
    const identifiers = [body.channel, body.subscriptionId]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean);

    return [...new Set(identifiers)];
  }

  /**
   * Monta a cláusula WHERE que resolve a empresa cujo array jsonb
   * `canalId_notificameHub` contém ALGUM dos ids de contexto do webhook.
   *
   * Usa o operador de containment `@>` do Postgres por id de canal, em OR.
   * Ex.: `company.canalId_notificameHub @> '[{"id":"<channel>"}]'`.
   *
   * O alias `company` é usado em ambas as queries (relatory join e company).
   */
  private buildChannelContainmentClause(channelContextIds: string[]): {
    clause: string;
    params: Record<string, string>;
  } {
    const conditions: string[] = [];
    const params: Record<string, string> = {};

    channelContextIds.forEach((channelId, index) => {
      const key = `channelCtx${index}`;
      // jsonb containment: o array da empresa contém um objeto com este id.
      conditions.push(
        `company."canalId_notificameHub" @> jsonb_build_array(jsonb_build_object('id', CAST(:${key} AS text)))`,
      );
      params[key] = channelId;
    });

    return {
      // Se não houver contexto, força no-match (callers já tratam length === 0).
      clause: conditions.length ? `(${conditions.join(' OR ')})` : '1 = 0',
      params,
    };
  }
}
