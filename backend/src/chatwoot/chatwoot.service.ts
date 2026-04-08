import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../companies/entities/companies';
import { Client } from '../clients/entities.ts/clients';
import { ChatwootAssignDto, ChatwootConversationsQueryDto } from './dto/chatwoot.dto';
import { RedisService } from '../redis/redis.service';
import { JwtService } from '@nestjs/jwt';
import { Agent, type AgentRole } from '../agents/entities/agent.entity';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { ChatSessionHistoryService } from './chat-session-history.service';
import { RelatoryDispatchTemplate } from '../templates/entities/relatory.entity';

type ChatwootInbox = {
  id: number;
  name?: string;
  inbox_identifier?: string | null;
};

type ChatwootProfile = {
  id?: number | string | null;
  account_id?: number | string | null;
  pubsub_token?: string | null;
  pub_sub_token?: string | null;
};

type JwtPayload = {
  sub: string;
  account: string;
  agentId?: string;
  agentRole?: AgentRole;
};

type ChatwootProvisionResult = {
  userId: number;
  accessToken: string;
};

type MaestroWebhookAgent = {
  id: number;
  name: string;
  email: string;
  role: string | number;
  encryptedPassword: string | null;
  token: string | null;
};

@Injectable()
export class ChatwootService {
  private readonly defaultBaseUrl = 'https://chat.coraxy.com.br';
  private readonly logger = new Logger(ChatwootService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Agent)
    private readonly agentRepository: Repository<Agent>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(RelatoryDispatchTemplate)
    private readonly relatoryRepository: Repository<RelatoryDispatchTemplate>,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly chatSessionHistoryService: ChatSessionHistoryService,
  ) {}

  async getBootstrapByAccount(account: string, authorization?: string) {
    const context = await this.resolveAgentContext(account, authorization);
    const readContext = await this.resolveReadContext(account, authorization);
    const cacheKey = `chatwoot:${account}:bootstrap:${context.agentId}`;
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) return cached;
    const inboxes = await this.fetchInboxesByAccount(readContext.account, readContext.token);
    const accountApiEnabled = await this.testAccountApiAccess(readContext.account, readContext.token);
    const realtimeProfile = await this.fetchRealtimeProfile(context.token);

    const inboxOptions = inboxes
      .map((inbox) => ({
        id: inbox.id,
        name: inbox.name ?? `Inbox ${inbox.id}`,
        identifier: inbox.inbox_identifier ?? '',
      }))
      .filter((item) => String(item.identifier).trim().length > 0);

    const selectedInboxIdentifier =
      inboxOptions.length === 1 ? inboxOptions[0].identifier : null;

    const contacts = await this.clientRepository.find({
      where: { company: { id: context.company.id } },
      select: { id: true, name: true, whatsapp: true, createdAt: true },
      order: { createdAt: 'DESC' },
      take: 100,
    });

    const payload = {
      company: {
        id: context.company.id,
        name: context.company.name,
        account: context.company.account_chatwoot,
      },
      chatwoot: {
        baseUrl: this.defaultBaseUrl,
        inboxes: inboxOptions,
        selectedInboxIdentifier,
        teamChargeId: context.company.teamChargeId ?? null,
        realtime:
          realtimeProfile.pubsubToken && realtimeProfile.userId && realtimeProfile.accountId
            ? {
                enabled: true,
                cableUrl: `${this.defaultBaseUrl}/cable`,
                pubsubToken: realtimeProfile.pubsubToken,
                accountId: realtimeProfile.accountId,
                userId: realtimeProfile.userId,
              }
            : {
                enabled: false,
                cableUrl: `${this.defaultBaseUrl}/cable`,
                pubsubToken: null,
                accountId: realtimeProfile.accountId ?? this.toNumericId(context.account),
                userId: realtimeProfile.userId ?? null,
              },
        permissions: {
          accountApi: accountApiEnabled,
        },
        availableLabels: this.normalizeCompanyLabels(context.company.config),
      },
      contacts: contacts.map((client) => ({
        id: client.id,
        name: client.name ?? '',
        phone: client.whatsapp ?? '',
        identifier: this.normalizePhone(client.whatsapp ?? ''),
      })),
    };

    await this.redisService.set(cacheKey, payload, 60);
    return payload;
  }

  async listConversations(
    query: ChatwootConversationsQueryDto,
    authorization?: string,
  ) {
    const context = await this.resolveAgentContext(query.account, authorization);
    const teamId = query.teamId ?? context.teamChargeId ?? null;
    const cacheKey = `chatwoot:${query.account}:conv:${context.agentId}:${query.status ?? 'all'}:${teamId ?? 'all'}`;
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) return cached;

    const rows = await this.chatSessionHistoryService.listConversations({
      companyId: context.company.id,
      status: query.status ?? null,
      teamId,
    });

    const payload = {
      data: rows.map((s) => ({
        id: s.externalConversationId,
        status: s.status,
        inboxId: s.externalInboxId,
        contactId: s.externalContactId,
        contactName: s.contactName ?? `Conversa #${s.externalConversationId}`,
        phone: s.phone ?? '',
        labels: s.labels ?? [],
        assigneeName: s.assigneeName,
        teamName: s.teamName,
        lastMessage: s.lastMessage ?? '',
        protocol: s.protocol,
        report: s.report,
        generatedProtocol: s.generatedProtocol,
        unreadCount: s.unreadCount ?? 0,
        updatedAt: s.lastExternalUpdatedAt ?? s.updatedAt,
        contactIdentifier: s.contactIdentifier,
        inboxIdentifier: s.inboxIdentifier,
      })),
    };

    await this.redisService.set(cacheKey, payload, 20);
    return payload;
  }

  async syncRealtimeEvent(
    account: string,
    event: string,
    data: Record<string, any>,
    authorization?: string,
  ) {
    const context = await this.resolveAgentContext(account, authorization);

    if (event === 'message.created') {
      const convId = data.conversation_id ?? data.conversation?.id ?? null;
      if (!convId) return { ok: true };
      const systemAgentId = await this.resolveSystemAgentChatwootId(
        account,
        (context.company as any).token_system_coraxy,
      );
      const normalized = this.normalizeMessage(data, systemAgentId);
      await this.syncAttendanceMessagesSafely(context.company.id, account, [{
        conversationId: Number(convId),
        snapshot: normalized,
        rawPayload: data,
      }]);
      await this.patchAttendanceHistorySafely({
        companyId: context.company.id,
        account,
        conversationId: Number(convId),
        lastMessage: normalized.content ?? null,
        updatedAt: normalized.createdAt ?? new Date(),
      });
      await this.redisService.delByPrefix(`chatwoot:${account}:msg:`);

      // Mensagem incoming de contato: marca disparos desse número como respondidos
      const isIncoming = Number(data.message_type) === 0 ||
        String(data.sender_type ?? '').toLowerCase() === 'contact';
      const senderPhone = String(data.sender?.phone_number ?? '').trim();
      if (isIncoming && senderPhone) {
        await this.markRelatoriesAsResponded(context.company.id, senderPhone);
      }
    } else {
      // Eventos de conversa: conversation.created, conversation.status_changed, etc.
      const convId = data.id ?? data.conversation?.id ?? null;
      if (!convId) return { ok: true };
      const meta = data.meta ?? {};
      const sender = meta.sender ?? {};
      const assignee = meta.assignee ?? {};
      const team = meta.team ?? {};
      const attrs = data.additional_attributes ?? {};
      await this.chatSessionHistoryService.syncAttendances({
        companyId: context.company.id,
        account,
        rows: [{
          snapshot: {
            id: Number(convId),
            status: data.status ?? null,
            inboxId: data.inbox_id ?? null,
            contactId: sender.id ?? null,
            assigneeId: assignee.id ?? null,
            teamId: team.id ?? null,
            contactName: sender.name ?? null,
            phone: sender.phone_number ?? null,
            labels: Array.isArray(data.labels) ? data.labels : [],
            assigneeName: assignee.name ?? null,
            teamName: team.name ?? null,
            lastMessage: data.last_non_activity_message?.content ?? null,
            protocol: attrs.protocol ?? null,
            report: attrs.report ?? null,
            generatedProtocol: Boolean(attrs.generated_protocol),
            unreadCount: data.unread_count ?? 0,
            updatedAt: data.last_activity_at ?? null,
            contactIdentifier: sender.identifier ?? null,
            inboxIdentifier: null,
          },
          rawPayload: data,
        }],
      });
      await this.redisService.delByPrefix(`chatwoot:${account}:conv:`);
    }

    return { ok: true };
  }

  async listMessages(
    account: string,
    conversationId: number,
    _inboxIdentifier?: string,
    _contactIdentifier?: string,
    authorization?: string,
  ) {
    const context = await this.resolveAgentContext(account, authorization);
    const cacheKey = `chatwoot:${account}:msg:${context.agentId}:${conversationId}`;
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) return cached;

    const rows = await this.chatSessionHistoryService.listMessagesByConversation({
      companyId: context.company.id,
      conversationId,
    });

    // Conversa órfã: sem mensagens no banco → busca no Chatwoot e sincroniza.
    if (rows.length === 0) {
      try {
        const readCtx = await this.resolveReadContext(account, authorization);
        const data = await this.chatwootRequest(
          readCtx.account,
          readCtx.token,
          `/conversations/${conversationId}/messages`,
          { method: 'GET' },
        );
        const rawRows: any[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.payload)
            ? data.payload
            : Array.isArray(data?.data)
              ? data.data
              : [];
        const systemAgentId = await this.resolveSystemAgentChatwootId(
          readCtx.account,
          (context.company as any).token_system_coraxy,
        );
        const normalizedRows = rawRows.map((item: any) => this.normalizeMessage(item, systemAgentId));

        await this.syncAttendanceMessagesSafely(
          context.company.id,
          readCtx.account,
          rawRows.map((item: any, index: number) => ({
            conversationId,
            snapshot: normalizedRows[index],
            rawPayload: item,
          })),
        );

        const payload = {
          data: normalizedRows.map((m: ReturnType<typeof this.normalizeMessage>) => ({
            id: m.id,
            content: m.content ?? '',
            senderType: m.senderType ?? 'contact',
            senderName: m.senderName ?? null,
            createdAt: m.createdAt ?? null,
          })),
        };
        await this.redisService.set(cacheKey, payload, 10);
        return payload;
      } catch (err) {
        this.logger.warn(
          `Fallback Chatwoot falhou para conversation ${conversationId}: ${(err as any)?.message ?? err}`,
        );
      }
    }

    const payload = {
      data: rows.map((m) => ({
        id: m.externalMessageId,
        content: m.content ?? '',
        senderType: m.senderType ?? 'contact',
        senderName: m.senderName ?? null,
        createdAt: m.externalCreatedAt ?? m.createdAt,
      })),
    };

    await this.redisService.set(cacheKey, payload, 10);
    return payload;
  }

  async sendMessage(
    account: string,
    conversationId: number,
    content: string,
    inboxIdentifier?: string,
    contactIdentifier?: string,
    authorization?: string,
  ) {
    const safeContent = String(content ?? '').trim();
    if (!safeContent) {
      throw new BadRequestException('content é obrigatório');
    }

    const context = await this.resolveAgentContext(account, authorization);
    const accountApiEnabled = await this.testAccountApiAccess(context.account, context.token);
    if (!accountApiEnabled) {
      if (!inboxIdentifier || !contactIdentifier) {
        throw new BadRequestException('inboxIdentifier e contactIdentifier são obrigatórios em modo bot');
      }
      const data = await this.chatwootPublicPost(
        inboxIdentifier,
        contactIdentifier,
        `/conversations/${conversationId}/messages`,
        { content: safeContent },
      );
      await this.invalidateAccountCache(account);
      const normalizedMessage = this.normalizeMessage({
        ...(data ?? {}),
        content: data?.content ?? safeContent,
        sender_type: data?.sender_type ?? 'contact',
        created_at: data?.created_at ?? null,
      });
      await this.syncAttendanceMessagesSafely(context.company.id, context.account, [
        {
          conversationId,
          snapshot: normalizedMessage,
          rawPayload: data ?? { content: safeContent, sender_type: 'contact' },
        },
      ]);
      await this.patchAttendanceHistorySafely({
        companyId: context.company.id,
        account: context.account,
        conversationId,
        lastMessage: normalizedMessage.content ?? safeContent,
        updatedAt: normalizedMessage.createdAt ?? new Date(),
      });
      return {
        id: normalizedMessage.id,
        content: normalizedMessage.content ?? safeContent,
        senderType: normalizedMessage.senderType ?? 'contact',
        createdAt: normalizedMessage.createdAt ?? null,
      };
    }

    const data = await this.chatwootRequest(
      context.account,
      context.token,
      `/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          content: safeContent,
          message_type: 'outgoing',
          private: false,
        }),
      },
    );

    const normalizedMessage = this.normalizeMessage({
      ...(data ?? {}),
      content: data?.content ?? safeContent,
      sender: data?.sender ?? { type: 'agent' },
      created_at: data?.created_at ?? null,
    });
    await this.invalidateAccountCache(account);
    await this.syncAttendanceMessagesSafely(context.company.id, context.account, [
      {
        conversationId,
        snapshot: normalizedMessage,
        rawPayload: data ?? { content: safeContent, sender: { type: 'agent' } },
      },
    ]);
    await this.patchAttendanceHistorySafely({
      companyId: context.company.id,
      account: context.account,
      conversationId,
      lastMessage: normalizedMessage.content ?? safeContent,
      updatedAt: normalizedMessage.createdAt ?? new Date(),
    });

    return {
      id: normalizedMessage.id,
      content: normalizedMessage.content ?? safeContent,
      senderType: normalizedMessage.senderType ?? 'agent',
      createdAt: normalizedMessage.createdAt ?? null,
    };
  }

  async deleteLocalConversation(account: string, conversationId: number, authorization?: string) {
    const context = await this.resolveAgentContext(account, authorization);
    try {
      await this.chatSessionHistoryService.deleteConversation(context.company.id, conversationId);
    } catch (err: any) {
      this.logger.error(`Erro ao deletar conversa local ${conversationId}: ${err?.message ?? err}`);
      throw err;
    }
    await this.redisService.delByPrefix(`chatwoot:${account}:`);
    return { ok: true };
  }

  async updateStatus(
    account: string,
    conversationId: number,
    status: 'open' | 'resolved' | 'pending' | 'snoozed',
    authorization?: string,
  ) {
    const context = await this.resolveAgentContext(account, authorization);
    const accountApiEnabled = await this.testAccountApiAccess(context.account, context.token);
    if (!accountApiEnabled) {
      throw new BadRequestException('Token atual não permite alterar status de conversa');
    }
    await this.chatwootRequest(
      context.account,
      context.token,
      `/conversations/${conversationId}/toggle_status`,
      {
        method: 'POST',
        body: JSON.stringify({ status }),
      },
    );

    await this.invalidateAccountCache(account);
    await this.patchAttendanceHistorySafely({
      companyId: context.company.id,
      account: context.account,
      conversationId,
      status,
      unreadCount: status === 'resolved' ? 0 : undefined,
      updatedAt: new Date(),
    });
    return { ok: true };
  }

  async assignConversation(
    account: string,
    conversationId: number,
    payload: ChatwootAssignDto,
    authorization?: string,
  ) {
    const context = await this.resolveAgentContext(account, authorization);
    const accountApiEnabled = await this.testAccountApiAccess(context.account, context.token);
    if (!accountApiEnabled) {
      throw new BadRequestException('Token atual não permite transferir conversa');
    }
    await this.chatwootRequest(
      context.account,
      context.token,
      `/conversations/${conversationId}/assignments`,
      {
        method: 'POST',
        body: JSON.stringify({
          assignee_id: payload.assigneeId ?? null,
          team_id: payload.teamId ?? null,
        }),
      },
    );

    await this.invalidateAccountCache(account);
    await this.patchAttendanceHistorySafely({
      companyId: context.company.id,
      account: context.account,
      conversationId,
      assigneeId: payload.assigneeId ?? null,
      teamId: payload.teamId ?? null,
      updatedAt: new Date(),
    });
    return { ok: true };
  }

  async updateLabels(
    account: string,
    conversationId: number,
    labels: string[],
    authorization?: string,
  ) {
    const context = await this.resolveManageContext(account, authorization);
    const accountApiEnabled = await this.testAccountApiAccess(context.account, context.token);
    if (!accountApiEnabled) {
      throw new BadRequestException('Token atual não permite editar etiquetas');
    }
    await this.chatwootRequest(
      context.account,
      context.token,
      `/conversations/${conversationId}/labels`,
      {
        method: 'POST',
        body: JSON.stringify({
          labels: (labels ?? []).map((item) => String(item).trim()).filter(Boolean),
        }),
      },
    );

    await this.invalidateAccountCache(account);
    await this.patchAttendanceHistorySafely({
      companyId: context.company.id,
      account: context.account,
      conversationId,
      labels,
      updatedAt: new Date(),
    });
    return { ok: true };
  }

  async updateContactLabels(
    account: string,
    contactId: number,
    labels: string[],
    authorization?: string,
  ) {
    const context = await this.resolveManageContext(account, authorization);
    const accountApiEnabled = await this.testAccountApiAccess(context.account, context.token);
    if (!accountApiEnabled) {
      throw new BadRequestException('Token atual não permite editar etiquetas do contato');
    }

    await this.chatwootRequest(
      context.account,
      context.token,
      `/contacts/${contactId}/labels`,
      {
        method: 'POST',
        body: JSON.stringify({
          labels: (labels ?? []).map((item) => String(item).trim()).filter(Boolean),
        }),
      },
      true,
    );

    await this.invalidateAccountCache(account);
    return { ok: true };
  }

  async listTeams(account: string, authorization?: string) {
    const context = await this.resolveReadContext(account, authorization);
    const cacheKey = `chatwoot:${account}:teams:${context.agentId}`;
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) return cached;
    const accountApiEnabled = await this.testAccountApiAccess(context.account, context.token);
    if (!accountApiEnabled) return { data: [] };
    const data = await this.chatwootRequest(context.account, context.token, `/teams`, {
      method: 'GET',
    });

    const rows = Array.isArray(data?.payload) ? data.payload : Array.isArray(data) ? data : [];
    const payload = {
      data: rows.map((item: any) => ({
        id: item.id,
        name: item.name ?? `Team ${item.id}`,
      })),
    };
    await this.redisService.set(cacheKey, payload, 120);
    return payload;
  }

  async listConversationLabels(
    account: string,
    conversationId: number,
    authorization?: string,
  ) {
    const context = await this.resolveReadContext(account, authorization);
    const data = await this.chatwootRequest(
      context.account,
      context.token,
      `/conversations/${conversationId}/labels`,
      { method: 'GET' },
      true,
    );

    return { data: this.extractLabels(data) };
  }

  async listAccountLabels(account: string, authorization?: string) {
    const context = await this.resolveReadContext(account, authorization);
    const cacheKey = `chatwoot:${account}:labels:${context.agentId}`;
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) return cached;

    const data =
      await this.chatwootRequest(
        context.account,
        context.token,
        `/labels`,
        { method: 'GET' },
        true,
      ) ??
      await this.chatwootRequest(
        context.account,
        context.token,
        `/labels/list`,
        { method: 'GET' },
        true,
      );

    const payload = { data: this.extractLabels(data) };
    await this.redisService.set(cacheKey, payload, 120);
    return payload;
  }

  async listContactLabels(
    account: string,
    contactId: number,
    authorization?: string,
  ) {
    const context = await this.resolveReadContext(account, authorization);
    const data = await this.chatwootRequest(
      context.account,
      context.token,
      `/contacts/${contactId}/labels`,
      { method: 'GET' },
      true,
    );

    return { data: this.extractLabels(data) };
  }

  async getContactDetails(
    account: string,
    contactId: number,
    authorization?: string,
  ) {
    const context = await this.resolveReadContext(account, authorization);
    const data = await this.chatwootRequest(
      context.account,
      context.token,
      `/contacts/${contactId}`,
      { method: 'GET' },
      true,
    );

    const source = data?.payload ?? data?.data ?? data ?? {};
    return {
      data: {
        id: this.toNumericId(source?.id),
        name: String(source?.name ?? '').trim() || null,
        email: String(source?.email ?? '').trim() || null,
        phone: String(source?.phone_number ?? source?.phone ?? '').trim() || null,
        identifier: String(source?.identifier ?? source?.source_id ?? '').trim() || null,
        additionalAttributes:
          source?.additional_attributes && typeof source.additional_attributes === 'object'
            ? source.additional_attributes
            : {},
        customAttributes:
          source?.custom_attributes && typeof source.custom_attributes === 'object'
            ? source.custom_attributes
            : {},
      },
    };
  }

  async listAgents(account: string, authorization?: string) {
    const context = await this.resolveReadContext(account, authorization);
    const cacheKey = `chatwoot:${account}:agents:${context.agentId}`;
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) return cached;
    const accountApiEnabled = await this.testAccountApiAccess(context.account, context.token);
    if (!accountApiEnabled) return { data: [] };
    const data = await this.chatwootRequest(context.account, context.token, `/agents`, {
      method: 'GET',
    });

    const rows = Array.isArray(data?.payload) ? data.payload : Array.isArray(data) ? data : [];
    const payload = {
      data: rows.map((item: any) => ({
        id: item.id,
        name: item.name ?? item.email ?? `Agent ${item.id}`,
      })),
    };
    await this.redisService.set(cacheKey, payload, 120);
    return payload;
  }

  async listCompanyAgentsFromWebhook(companyId: string): Promise<MaestroWebhookAgent[]> {
    const context = await this.resolvePlatformAccessContext(companyId);
    const webhookUrl = String(
      this.configService.get<string>('MAESTRO_AGENTS_WEBHOOK_URL') ??
        'https://workflows.coraxy.com.br/webhook/integracao_agents_maestro',
    ).trim();
    const payload = JSON.stringify({ accountId: context.accountId });
    const authVariants: Array<Record<string, string>> = [
      { Authorization: context.platformToken },
      { Authorization: `Bearer ${context.platformToken}` },
      { 'x-maestro-token': context.platformToken },
      { 'X-Auth-Token': context.platformToken },
      { 'Auth-Token': context.platformToken },
      { 'X-N8N-API-KEY': context.platformToken },
    ];

    let response: Response | null = null;
    let lastErrorText = '';

    for (const authHeaders of authVariants) {
      response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: payload,
      });

      if (response.ok) {
        break;
      }

      lastErrorText = await response.text();
      if (response.status !== 401 && response.status !== 403) {
        break;
      }
    }

    if (!response?.ok) {
      throw new BadRequestException(
        `Webhook Maestro error (${response?.status ?? 500}): ${lastErrorText || 'unknown error'}`,
      );
    }

    const data = await response.json().catch(() => null);
    const rows = Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
        ? data.data
        : data
          ? [data]
          : [];

    return rows
      .map((item: any) => {
        const id = this.toNumericId(item?.id);
        const email = String(item?.email ?? '').trim().toLowerCase();

        if (!id || !email) {
          return null;
        }

        return {
          id,
          name: String(item?.name ?? email).trim() || email,
          email,
          role: item?.role ?? 'agent',
          encryptedPassword: String(item?.encrypted_password ?? '').trim() || null,
          token: String(item?.token ?? '').trim() || null,
        } satisfies MaestroWebhookAgent;
      })
      .filter((item: MaestroWebhookAgent | null): item is MaestroWebhookAgent => Boolean(item));
  }

  private normalizeMessage(item: any, systemAgentChatwootId?: number | null) {
    return {
      id: this.toNumericId(item?.id),
      content: item?.content ?? '',
      senderType: this.normalizeMessageSenderType(item, systemAgentChatwootId),
      senderName: this.extractMessageSenderName(item),
      createdAt: item?.created_at ?? null,
      messageType: this.toIntegerOrNull(item?.message_type),
      isPrivate: Boolean(item?.private),
    };
  }

  private async resolveCompanyContext(account: string) {
    const safeAccount = String(account ?? '').trim();
    if (!safeAccount) throw new BadRequestException('account é obrigatório');

    const company = await this.companyRepository.findOne({
      where: { account_chatwoot: safeAccount },
      select: {
        id: true,
        name: true,
        account_chatwoot: true,
        config: true,
        teamChargeId: true,
        token_system_coraxy: true,
      },
    });

    if (!company) {
      throw new BadRequestException('Empresa não encontrada para a account informada');
    }

    return { company, account: safeAccount };
  }

  private async resolveSystemAgentChatwootId(account: string, token: string | null | undefined): Promise<number | null> {
    const safeToken = String(token ?? '').trim();
    if (!safeToken) return null;

    const cacheKey = `chatwoot:${account}:system_agent_id`;
    const cached = await this.redisService.get<number>(cacheKey);
    if (cached != null) return cached;

    const profile = await this.chatwootProfileRequest(safeToken, true);
    const agentId = profile?.id ? Number(profile.id) : null;
    if (agentId) {
      await this.redisService.set(cacheKey, agentId, 3600);
    }
    return agentId;
  }

  private async resolveProvisioningContext(companyId: string) {
    const baseContext = await this.resolvePlatformAccessContext(companyId);
    const company = baseContext.company;
    const config = baseContext.config;
    const teamId = this.toNumericId(company.teamChargeId);

    const adminToken = String(
      config.chatwoot_admin_token ??
      config.chatwoot_app_token ??
      config.chatwoot_token_admin ??
      config.acess_token_admin_chatwoot ??
      '',
    ).trim();

    return {
      account: company.account_chatwoot,
      accountId: baseContext.accountId,
      adminToken: adminToken || null,
      platformToken: baseContext.platformToken,
      teamId,
    };
  }

  private extractCompanyAdminToken(config: Record<string, any>) {
    return String(
      config.chatwoot_admin_token ??
      config.chatwoot_app_token ??
      config.chatwoot_token_admin ??
      config.acess_token_admin_chatwoot ??
      '',
    ).trim() || null;
  }

  private async resolvePlatformAccessContext(companyId: string) {
    const normalizedCompanyId = String(companyId ?? '').trim();
    if (!normalizedCompanyId) {
      throw new BadRequestException('Empresa invalida para provisionamento.');
    }

    const company = await this.companyRepository.findOne({
      where: { id: normalizedCompanyId },
      select: {
        id: true,
        account_chatwoot: true,
        config: true,
        teamChargeId: true,
      },
    });

    if (!company) {
      throw new BadRequestException('Empresa nao encontrada para sincronizar com o Chatwoot.');
    }

    const config = (company.config as any) ?? {};
    const platformToken = String(
      this.configService.get<string>('CHATWOOT_PLATFORM_TOKEN') ?? '',
    ).trim();

    if (!platformToken) {
      throw new BadRequestException(
        'Configure a variavel de ambiente CHATWOOT_PLATFORM_TOKEN antes de criar agentes sincronizados.',
      );
    }

    const accountId = this.toNumericId(company.account_chatwoot);
    if (!accountId) {
      throw new BadRequestException(
        'A account_chatwoot da empresa precisa ser numerica para provisionar usuarios no Chatwoot.',
      );
    }

    return {
      company,
      config,
      account: company.account_chatwoot,
      accountId,
      platformToken,
    };
  }

  private async resolveAgentContext(account: string, authorization?: string) {
    const payload = await this.getTokenPayload(authorization);

    if (!payload.agentId) {
      throw new UnauthorizedException(
        'O chat esta disponivel apenas para usuarios autenticados como agente.',
      );
    }

    const context = await this.resolveCompanyContext(account);
    if (payload.sub !== context.company.id || String(payload.account) !== context.account) {
      throw new UnauthorizedException('Sessao do agente nao corresponde a empresa do chat.');
    }

    const agent = await this.agentRepository.findOne({
      where: {
        id: payload.agentId,
        company: { id: context.company.id },
      },
      relations: ['company'],
      select: {
        id: true,
        active: true,
        chatwootAccessToken: true,
        company: { id: true },
      },
    });

    if (!agent || !agent.active) {
      throw new UnauthorizedException('Agente nao encontrado ou bloqueado.');
    }

    const agentToken = String(agent.chatwootAccessToken ?? '').trim();
    if (!agentToken) {
      throw new UnauthorizedException(
        'Este agente ainda nao possui credencial individual do Chatwoot.',
      );
    }

    return {
      company: context.company,
      account: context.account,
      token: agentToken,
      agentId: agent.id,
      teamChargeId: context.company.teamChargeId ?? null,
    };
  }

  private async resolveReadContext(account: string, authorization?: string) {
    const agentContext = await this.resolveAgentContext(account, authorization);
    const adminToken = this.extractCompanyAdminToken(
      ((agentContext.company.config as Record<string, any> | null) ?? {}) as Record<string, any>,
    );

    return {
      ...agentContext,
      token: adminToken || agentContext.token,
    };
  }

  private async resolveManageContext(account: string, authorization?: string) {
    return this.resolveReadContext(account, authorization);
  }

  private async fetchInboxesByAccount(account: string, token: string) {
    const data = await this.chatwootRequest(account, token, '/inboxes', { method: 'GET' }, true);
    return Array.isArray(data) ? (data as ChatwootInbox[]) : ([] as ChatwootInbox[]);
  }

  private async fetchRealtimeProfile(token: string) {
    const data = await this.chatwootProfileRequest(token, true);
    const profile = (data ?? {}) as ChatwootProfile;

    return {
      userId: this.toNumericId(profile.id),
      accountId: this.toNumericId(profile.account_id),
      pubsubToken: String(profile.pubsub_token ?? profile.pub_sub_token ?? '').trim() || null,
    };
  }

  private async testAccountApiAccess(account: string, token: string) {
    const cacheKey = `chatwoot:${account}:api-access:${token.slice(-8)}`;
    const cached = await this.redisService.get<boolean>(cacheKey);
    if (cached !== null && cached !== undefined) return cached;

    const probes = ['/agents', '/teams', '/conversations?status=all'];
    let enabled = false;
    for (const path of probes) {
      const result = await this.chatwootRequest(account, token, path, { method: 'GET' }, true);
      if (result !== null && result !== undefined) { enabled = true; break; }
    }

    await this.redisService.set(cacheKey, enabled, 300);
    return enabled;
  }

  private async chatwootPublicPost(
    inboxIdentifier: string,
    contactIdentifier: string,
    tail: string,
    payload: Record<string, any>,
  ) {
    try {
      const response = await fetch(
        `${this.defaultBaseUrl}/public/api/v1/inboxes/${inboxIdentifier}/contacts/${contactIdentifier}${tail}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  }

  private async chatwootRequest(
    account: string,
    token: string,
    path: string,
    init: RequestInit,
    suppressError = false,
  ) {
    try {
      const response = await fetch(
        `${this.defaultBaseUrl}/api/v1/accounts/${account}${path}`,
        {
          ...init,
          headers: {
            'Content-Type': 'application/json',
            api_access_token: token,
            ...(init.headers ?? {}),
          },
        },
      );

      if (!response.ok) {
        if (suppressError) return null;
        const text = await response.text();
        throw new BadRequestException(`Chatwoot error (${response.status}): ${text || 'unknown error'}`);
      }

      if (response.status === 204) return null;
      return response.json();
    } catch (error: any) {
      if (suppressError) return null;
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(error?.message ?? 'Erro ao comunicar com Chatwoot');
    }
  }

  private async chatwootProfileRequest(token: string, suppressError = false) {
    try {
      const response = await fetch(`${this.defaultBaseUrl}/api/v1/profile`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          api_access_token: token,
        },
      });

      if (!response.ok) {
        if (suppressError) return null;
        const text = await response.text();
        throw new BadRequestException(`Chatwoot profile error (${response.status}): ${text || 'unknown error'}`);
      }

      return response.json();
    } catch (error: any) {
      if (suppressError) return null;
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(error?.message ?? 'Erro ao obter perfil realtime do Chatwoot');
    }
  }

  private async platformRequest(
    path: string,
    token: string,
    init: RequestInit,
    suppressError = false,
  ) {
    try {
      const response = await fetch(`${this.defaultBaseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          api_access_token: token,
          ...(init.headers ?? {}),
        },
      });

      if (!response.ok) {
        if (suppressError) return null;
        const text = await response.text();
        throw new BadRequestException(
          `Chatwoot platform error (${response.status}): ${text || 'unknown error'}`,
        );
      }

      if (response.status === 204) return null;
      return response.json();
    } catch (error: any) {
      if (suppressError) return null;
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        error?.message ?? 'Erro ao comunicar com a Platform API do Chatwoot',
      );
    }
  }

  private extractLabels(data: any): string[] {
    const raw =
      Array.isArray(data)
        ? data
        : Array.isArray(data?.payload)
          ? data.payload
          : Array.isArray(data?.payload?.labels)
            ? data.payload.labels
            : Array.isArray(data?.labels)
              ? data.labels
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.data?.labels)
              ? data.data.labels
            : Array.isArray(data?.data?.payload)
              ? data.data.payload
              : [];

    const normalized: string[] = raw
      .map((item: any) =>
        typeof item === 'string'
          ? item
          : String(item?.title ?? item?.name ?? item?.label ?? '').trim(),
      )
      .map((item: string) => String(item).trim())
      .filter(Boolean);

    return Array.from(new Set<string>(normalized)).sort((left: string, right: string) =>
      left.localeCompare(right, 'pt-BR'),
    );
  }

  private async markRelatoriesAsResponded(companyId: string, rawPhone: string): Promise<void> {
    const normalizedPhone = rawPhone.replace(/\D/g, '');
    if (!normalizedPhone) return;

    try {
      await this.relatoryRepository
        .createQueryBuilder()
        .update(RelatoryDispatchTemplate)
        .set({ response: true, response_at: new Date() })
        .where('"companyId" = :companyId', { companyId })
        .andWhere('response = false')
        .andWhere("regexp_replace(number, '[^0-9]', '', 'g') = :phone", { phone: normalizedPhone })
        .execute();

      await this.redisService.delByPrefix(`graphics:${companyId}:`);
    } catch (err: any) {
      this.logger.error(`Erro ao marcar retorno no relatory para ${normalizedPhone}: ${err?.message ?? err}`);
    }
  }

  private normalizeMessageSenderType(item: any, systemAgentChatwootId?: number | null) {
    if (systemAgentChatwootId && Number(item?.sender?.id) === systemAgentChatwootId) {
      return 'agent_bot';
    }

    const rawSenderType = String(
      item?.sender_type ??
      item?.sender?.type ??
      item?.sender?.role ??
      '',
    )
      .trim()
      .toLowerCase();

    if (
      rawSenderType === 'agent_bot' ||
      rawSenderType === 'bot'
    ) {
      return 'agent_bot';
    }

    if (
      rawSenderType === 'agent' ||
      rawSenderType === 'user' ||
      rawSenderType === 'administrator' ||
      rawSenderType === 'admin'
    ) {
      return 'agent';
    }

    if (Number(item?.message_type) === 1) {
      return 'agent';
    }

    // message_type 2 = activity (automações, atribuições, eventos de sistema do Chatwoot)
    if (Number(item?.message_type) === 2) {
      return 'agent';
    }

    return 'contact';
  }

  private extractMessageSenderName(item: any) {
    return String(
      item?.sender?.name ??
      item?.sender?.available_name ??
      item?.sender?.display_name ??
      item?.sender?.email ??
      '',
    ).trim() || null;
  }

  private async invalidateAccountCache(account: string) {
    await this.redisService.delByPrefix(`chatwoot:${account}:`);
  }

  async invalidateChatCache(account: string) {
    await this.invalidateAccountCache(account);
  }

  private normalizeCompanyLabels(config: Company['config'] | string | null | undefined) {
    const parsed =
      typeof config === 'string'
        ? (() => {
            try {
              return JSON.parse(config) as Record<string, unknown>;
            } catch {
              return {};
            }
          })()
        : ((config as Record<string, unknown> | null | undefined) ?? {});

    const raw = Array.isArray((parsed as any).chatwoot_labels)
      ? ((parsed as any).chatwoot_labels as unknown[])
      : [];

    return Array.from(
      new Set(
        raw
          .map((item) => String(item ?? '').trim())
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right, 'pt-BR'));
  }

  private normalizePhone(phone: string) {
    return String(phone ?? '').replace(/\D/g, '');
  }

  private toNumericId(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private toIntegerOrNull(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }

  private async syncAttendanceMessagesSafely(
    companyId: string,
    account: string,
    rows: Array<{ conversationId: number; snapshot: any; rawPayload?: unknown }>,
  ) {
    if (!rows.length) {
      return;
    }

    try {
      await this.chatSessionHistoryService.syncMessages({ companyId, account, rows });
    } catch (error: any) {
      this.logger.error(
        `Falha ao espelhar mensagens dos atendimentos da account ${account}: ${error?.message ?? error}`,
      );
    }
  }

  private async patchAttendanceHistorySafely(input: {
    companyId: string;
    account: string;
    conversationId: number;
    status?: string | null;
    assigneeId?: number | null;
    teamId?: number | null;
    labels?: string[];
    lastMessage?: string | null;
    protocol?: string | null;
    generatedProtocol?: boolean;
    report?: string | null;
    unreadCount?: number | null;
    updatedAt?: string | Date | null;
    rawPayload?: unknown;
  }) {
    try {
      await this.chatSessionHistoryService.patchAttendance(input);
    } catch (error: any) {
      this.logger.error(
        `Falha ao atualizar snapshot do atendimento ${input.conversationId} na account ${input.account}: ${error?.message ?? error}`,
      );
    }
  }

  private async getTokenPayload(authorization?: string) {
    const token = String(authorization ?? '')
      .replace(/^Bearer\s+/i, '')
      .trim();

    if (!token) {
      throw new UnauthorizedException('Token nao informado');
    }

    try {
      return await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token invalido');
    }
  }

  async provisionAgentIdentity(input: {
    companyId: string;
    name: string;
    email: string;
    password: string;
    role: AgentRole;
  }): Promise<ChatwootProvisionResult> {
    const context = await this.resolveProvisioningContext(input.companyId);
    const user = await this.platformRequest('/platform/api/v1/users', context.platformToken, {
      method: 'POST',
      body: JSON.stringify({
        name: input.name,
        email: input.email,
        password: input.password,
        display_name: input.name,
      }),
    });

    const userId = this.toNumericId(user?.id);
    const accessToken = String(user?.access_token ?? '').trim();

    if (!userId || !accessToken) {
      throw new BadRequestException(
        'Chatwoot nao retornou o usuario ou token do agente criado.',
      );
    }

    await this.platformRequest(
      `/platform/api/v1/accounts/${context.accountId}/account_users`,
      context.platformToken,
      {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          role: input.role === 'admin' ? 'administrator' : 'agent',
        }),
      },
    );

    if (context.teamId && context.adminToken) {
      await this.chatwootRequest(
        context.account,
        context.adminToken,
        `/teams/${context.teamId}/team_members`,
        {
          method: 'POST',
          body: JSON.stringify({ user_ids: [userId] }),
        },
        true,
      );
    }

    return { userId, accessToken };
  }

  async removeAgentIdentity(companyId: string, chatwootUserId?: number | null) {
    const userId = this.toNumericId(chatwootUserId);
    if (!userId) return;

    const context = await this.resolveProvisioningContext(companyId);
    await this.platformRequest(
      `/platform/api/v1/users/${userId}`,
      context.platformToken,
      { method: 'DELETE' },
      true,
    );
  }

  async inspectCompanyPlatformAccess(companyId: string) {
    const context = await this.resolvePlatformAccessContext(companyId);
    const result = await this.platformRequest(
      `/platform/api/v1/accounts/${context.accountId}`,
      context.platformToken,
      { method: 'GET' },
      true,
    );

    return {
      accountId: context.accountId,
      ok: Boolean(result),
      message: result
        ? 'Platform App com acesso a account do Chatwoot.'
        : 'Platform App sem permissao explicita sobre esta account do Chatwoot.',
    };
  }

  createProvisionPassword() {
    return `${randomBytes(12).toString('base64url')}A1!`;
  }
}
