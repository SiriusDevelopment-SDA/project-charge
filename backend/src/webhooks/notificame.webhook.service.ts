import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RelatoryDispatchTemplate } from '../templates/entities/relatory.entity';
import { ChatSession } from '../chatwoot/entities/chat-session.entity';
import { Company } from '../companies/entities/companies';
import { ChatGateway } from '../realtime/chat.gateway';
import { RedisService } from '../redis/redis.service';
import { localPhoneDigits } from '../utils';
import {
  extrairIdsDeContextoDeCanal,
  extrairIdsDeMensagem,
  extrairTextoDaMensagem,
  montarClausulaDeCanalDaEmpresa,
  montarClausulaDeTelefoneLocal,
  statusIndicaFalha,
  statusIndicaResposta,
  traduzirCodigoDeStatus,
  type NotificaMeWebhookPayload,
} from './notificame.webhook.rules';

/**
 * Processa os eventos da NotificaMe: persistencia, cache e emissao em tempo
 * real.
 *
 * Antes isto vivia no controller, junto com o roteamento HTTP e com as regras
 * puras (que agora estao em `notificame.webhook.rules.ts`). Aqui fica o que
 * precisa de banco: nenhuma decisao nova, so a execucao delas.
 */
@Injectable()
export class NotificaMeWebhookService {
  private readonly logger = new Logger(NotificaMeWebhookService.name);

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

  async processarEvento(body: NotificaMeWebhookPayload): Promise<void> {
    if (!body || typeof body !== 'object') {
      this.logger.warn('[Webhook] Body inválido ou ausente');
      return;
    }

    this.logger.verbose(
      `[Webhook] type=${body.type ?? 'unknown'} id=${body.id ?? '-'}`,
    );

    if (body.type === 'MESSAGE') {
      await this.registrarMensagemRecebida(body);
      return;
    }

    if (body.type !== 'MESSAGE_STATUS') {
      this.logger.log(`[Webhook] Tipo ignorado: ${body.type}`);
      return;
    }

    await this.registrarStatusDeEnvio(body);
  }

  private async registrarStatusDeEnvio(
    body: NotificaMeWebhookPayload,
  ): Promise<void> {
    const candidateMessageIds = extrairIdsDeMensagem(body);
    const rawCode = String(body.messageStatus?.code ?? '').toUpperCase();

    if (candidateMessageIds.length === 0) {
      this.logger.warn(
        '[Webhook] MESSAGE_STATUS sem identificador de mensagem, ignorando',
      );
      return;
    }

    const newStatus = traduzirCodigoDeStatus(rawCode);
    if (!newStatus) {
      this.logger.warn(
        `[Webhook] Status desconhecido: "${rawCode}" - ids: ${candidateMessageIds.join(', ')}`,
      );
      return;
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
      return;
    }

    // `response` so e marcado na primeira vez: reescrever `response_at` a cada
    // READ subsequente empurraria a data da resposta para frente.
    const marcaResposta = statusIndicaResposta(newStatus) && !relatory.response;

    await this.relatoryRepository.update(relatory.id, {
      status_sent: newStatus,
      ...(marcaResposta ? { response: true, response_at: new Date() } : {}),
    });

    const isFailed = statusIndicaFalha(newStatus);
    const logFn = isFailed
      ? this.logger.warn.bind(this.logger)
      : this.logger.log.bind(this.logger);
    logFn(
      `[Webhook] Mensagem ${String(relatory.external_message_id ?? candidateMessageIds[0]).slice(0, 8)} -> ${rawCode} (relatorio ${relatory.id.slice(0, 8)})${isFailed ? ` | descricao: ${body.messageStatus?.description ?? 'sem descricao'}` : ''}`,
    );
  }

  private async registrarMensagemRecebida(
    body: NotificaMeWebhookPayload,
  ): Promise<void> {
    const msgPayload = body.message;
    const rawFrom = String(msgPayload?.from ?? body.from ?? '').replace(
      /\D/g,
      '',
    );
    const channelContextIds = extrairIdsDeContextoDeCanal(body);

    if (!rawFrom) {
      this.logger.warn('[Webhook] MESSAGE sem campo "from", ignorando');
      return;
    }

    if (channelContextIds.length === 0) {
      this.logger.warn(
        `[Webhook] MESSAGE de ${rawFrom} sem contexto de canal/subscription, ignorando para evitar match cruzado entre empresas`,
      );
      return;
    }

    // Telefone local (sem prefixo de país 55). O webhook MESSAGE inbound chega
    // com 55 (ex.: "5511998950080"), mas o worker grava `relatory.number` cru,
    // sem 55 (ex.: "11998950080"). Comparamos pelo telefone local para casar
    // ambos os formatos. Ver notificame: handleIncomingMessage <-> worker.
    const localFrom = localPhoneDigits(rawFrom);

    // Marca relatorio como respondido.
    // canalId_notificameHub agora é jsonb (array de canais); resolvemos a
    // empresa cujo array contém algum dos ids de contexto do webhook.
    const channelMatch = montarClausulaDeCanalDaEmpresa(channelContextIds);
    const phoneMatch = montarClausulaDeTelefoneLocal(localFrom);
    const relatory = await this.relatoryRepository
      .createQueryBuilder('relatory')
      .innerJoinAndSelect('relatory.company', 'company')
      .where(phoneMatch.clause, phoneMatch.params)
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

    const textContent = extrairTextoDaMensagem(msgPayload);
    const senderName = String(msgPayload?.visitor?.name ?? '').trim() || rawFrom;
    const messageId = String(msgPayload?.id ?? body.id ?? '');
    const createdAt = String(
      msgPayload?.timestamp ?? body.timestamp ?? new Date().toISOString(),
    );

    if (!textContent) {
      this.logger.verbose(
        `[Webhook] MESSAGE de ${rawFrom} sem conteudo de texto, ignorando emissao`,
      );
      return;
    }

    // Resolve empresa: primeiro pelo relatorio, depois pelo canal diretamente
    let account = String(relatory?.company?.account_chatwoot ?? '').trim();
    let companyId = String(relatory?.company?.id ?? '').trim();

    if (!account || !companyId) {
      const company = await this.companyRepository
        .createQueryBuilder('company')
        .where(channelMatch.clause, channelMatch.params)
        .getOne();

      account = String(company?.account_chatwoot ?? '').trim();
      companyId = String(company?.id ?? '').trim();
    }

    if (!account || !companyId) {
      this.logger.warn(
        `[Webhook] Nao foi possivel resolver account/company para phone ${rawFrom}`,
      );
      return;
    }

    const session = await this.chatSessionRepository
      .createQueryBuilder('session')
      .where('session.companyId = :companyId', { companyId })
      .andWhere('(session.normalizedPhone = :phone OR session.phone = :phone)', {
        phone: rawFrom,
      })
      .andWhere('session.status IN (:...statuses)', {
        statuses: ['open', 'pending'],
      })
      .orderBy('session.lastExternalUpdatedAt', 'DESC')
      .getOne();

    if (!session) {
      this.logger.verbose(
        `[Webhook] Nenhuma sessao ativa encontrada para phone ${rawFrom}`,
      );
      return;
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
  }
}
