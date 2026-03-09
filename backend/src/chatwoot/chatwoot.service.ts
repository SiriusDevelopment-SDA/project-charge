import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../companies/entities/companies';
import { Client } from '../clients/entities.ts/clients';
import { ChatwootAssignDto, ChatwootConversationsQueryDto } from './dto/chatwoot.dto';
import { RedisService } from '../redis/redis.service';

type ChatwootInbox = {
  id: number;
  name?: string;
  inbox_identifier?: string | null;
};

@Injectable()
export class ChatwootService {
  private readonly defaultBaseUrl = 'https://chat.coraxy.com.br';

  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    private readonly redisService: RedisService,
  ) {}

  async getBootstrapByAccount(account: string) {
    const cacheKey = `chatwoot:${account}:bootstrap`;
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) return cached;

    const context = await this.resolveContext(account);
    const inboxes = await this.fetchInboxesByAccount(context.account, context.token);
    const accountApiEnabled = await this.testAccountApiAccess(context.account, context.token);

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
        permissions: {
          accountApi: accountApiEnabled,
        },
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

  async listConversations(query: ChatwootConversationsQueryDto) {
    const cacheKey = `chatwoot:${query.account}:conversations:${query.status ?? 'all'}:${query.inboxIdentifier ?? 'all'}`;
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) return cached;

    const context = await this.resolveContext(query.account);
    const accountApiEnabled = await this.testAccountApiAccess(context.account, context.token);
    const status = query.status && query.status !== 'all' ? query.status : undefined;
    const inboxes = await this.fetchInboxesByAccount(context.account, context.token);
    const selectedInbox = query.inboxIdentifier
      ? inboxes.find((item) => item.inbox_identifier === query.inboxIdentifier)
      : null;

    if (!accountApiEnabled) {
      const payload = await this.listConversationsByPublicApi(context.company.id, selectedInbox?.inbox_identifier ?? null);
      await this.redisService.set(cacheKey, payload, 20);
      return payload;
    }

    const search = new URLSearchParams();
    if (status) search.set('status', status);

    const data = await this.chatwootRequest(
      context.account,
      context.token,
      `/conversations${search.toString() ? `?${search.toString()}` : ''}`,
      { method: 'GET' },
    );

    const rawRows = this.extractConversationRows(data);
    const normalized = rawRows
      .map((item: any) => this.normalizeConversation(item))
      .filter((item: any) => (selectedInbox ? item.inboxId === selectedInbox.id : true));

    if (selectedInbox && !normalized.length && rawRows.length) {
      const payload = { data: rawRows.map((item: any) => this.normalizeConversation(item)) };
      await this.redisService.set(cacheKey, payload, 20);
      return payload;
    }

    const payload = { data: normalized };
    await this.redisService.set(cacheKey, payload, 20);
    return payload;
  }

  async listMessages(
    account: string,
    conversationId: number,
    inboxIdentifier?: string,
    contactIdentifier?: string,
  ) {
    const cacheKey = `chatwoot:${account}:messages:${conversationId}:${inboxIdentifier ?? 'na'}:${contactIdentifier ?? 'na'}`;
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) return cached;

    const context = await this.resolveContext(account);
    const accountApiEnabled = await this.testAccountApiAccess(context.account, context.token);
    if (!accountApiEnabled) {
      if (!inboxIdentifier || !contactIdentifier) {
        throw new BadRequestException('inboxIdentifier e contactIdentifier são obrigatórios em modo bot');
      }
      const data = await this.chatwootPublicRequest(
        inboxIdentifier,
        contactIdentifier,
        `/conversations/${conversationId}/messages`,
      );
      const rawRows = Array.isArray(data) ? data : [];
      const payload = {
        data: rawRows.map((item: any) => ({
          id: item.id,
          content: item.content ?? '',
          senderType: item.sender_type ?? 'contact',
          createdAt: item.created_at ?? null,
        })),
      };
      await this.redisService.set(cacheKey, payload, 10);
      return payload;
    }

    const data = await this.chatwootRequest(context.account, context.token, `/conversations/${conversationId}/messages`, { method: 'GET' });

    const rawRows = Array.isArray(data?.payload)
      ? data.payload
      : Array.isArray(data)
        ? data
        : [];

    const payload = {
      data: rawRows.map((item: any) => ({
        id: item.id,
        content: item.content ?? '',
        senderType:
          item.sender?.type ??
          (item.message_type === 1 ? 'agent' : 'contact'),
        createdAt: item.created_at ?? null,
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
  ) {
    const safeContent = String(content ?? '').trim();
    if (!safeContent) {
      throw new BadRequestException('content é obrigatório');
    }

    const context = await this.resolveContext(account);
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
      return {
        id: data?.id,
        content: data?.content ?? safeContent,
        senderType: data?.sender_type ?? 'contact',
        createdAt: data?.created_at ?? null,
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

    const payload = {
      id: data?.id,
      content: data?.content ?? safeContent,
      senderType: data?.sender?.type ?? 'agent',
      createdAt: data?.created_at ?? null,
    };
    await this.invalidateAccountCache(account);
    return payload;
  }

  async updateStatus(
    account: string,
    conversationId: number,
    status: 'open' | 'resolved' | 'pending' | 'snoozed',
  ) {
    const context = await this.resolveContext(account);
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
    return { ok: true };
  }

  async assignConversation(account: string, conversationId: number, payload: ChatwootAssignDto) {
    const context = await this.resolveContext(account);
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
    return { ok: true };
  }

  async updateLabels(account: string, conversationId: number, labels: string[]) {
    const context = await this.resolveContext(account);
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
    return { ok: true };
  }

  async listTeams(account: string) {
    const cacheKey = `chatwoot:${account}:teams`;
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) return cached;

    const context = await this.resolveContext(account);
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

  async listAgents(account: string) {
    const cacheKey = `chatwoot:${account}:agents`;
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) return cached;

    const context = await this.resolveContext(account);
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

  private normalizeConversation(item: any) {
    return {
      id: item?.id,
      status: item?.status ?? 'open',
      inboxId: item?.inbox_id ?? item?.meta?.inbox?.id ?? null,
      contactName:
        item?.meta?.sender?.name ??
        item?.contact?.name ??
        item?.contact_inbox?.name ??
        `Conversa #${item?.id}`,
      phone:
        item?.meta?.sender?.phone_number ??
        item?.contact_inbox?.source_id ??
        item?.meta?.sender?.identifier ??
        '',
      labels: Array.isArray(item?.labels) ? item.labels : [],
      assigneeName: item?.meta?.assignee?.name ?? item?.assignee?.name ?? null,
      teamName: item?.meta?.team?.name ?? item?.team?.name ?? null,
      lastMessage:
        item?.last_non_activity_message?.content ??
        item?.meta?.last_message?.content ??
        '',
      unreadCount: Number(item?.unread_count ?? 0),
      updatedAt: item?.updated_at ?? item?.last_activity_at ?? item?.created_at ?? null,
      contactIdentifier:
        item?.meta?.sender?.identifier ??
        item?.contact_inbox?.source_id ??
        null,
      inboxIdentifier:
        item?.meta?.inbox?.identifier ??
        null,
    };
  }

  private async resolveContext(account: string) {
    const safeAccount = String(account ?? '').trim();
    if (!safeAccount) throw new BadRequestException('account é obrigatório');

    const company = await this.companyRepository.findOne({
      where: { account_chatwoot: safeAccount },
      select: {
        id: true,
        name: true,
        account_chatwoot: true,
        acess_token_agentbot_chatwoot: true,
        token_system_coraxy: true,
        autorization: true,
        config: true,
      },
    });

    if (!company) {
      throw new BadRequestException('Empresa não encontrada para a account informada');
    }

    const config = (company.config as any) ?? {};
    const token = String(
      config.chatwoot_admin_token ??
      config.chatwoot_app_token ??
      config.chatwoot_token_admin ??
      config.acess_token_admin_chatwoot ??
      company.token_system_coraxy ??
      (company as any).acess_token_admin_chatwoot ??
      company.autorization ??
      company.acess_token_agentbot_chatwoot ??
      '',
    ).trim();
    if (!token) {
      throw new BadRequestException('Token Chatwoot não configurado para a empresa');
    }

    return { company, account: safeAccount, token };
  }

  private async fetchInboxesByAccount(account: string, token: string) {
    const data = await this.chatwootRequest(account, token, '/inboxes', { method: 'GET' }, true);
    return Array.isArray(data) ? (data as ChatwootInbox[]) : ([] as ChatwootInbox[]);
  }

  private async testAccountApiAccess(account: string, token: string) {
    const probes = ['/agents', '/teams', '/conversations?status=all'];
    for (const path of probes) {
      const result = await this.chatwootRequest(account, token, path, { method: 'GET' }, true);
      if (result !== null && result !== undefined) return true;
    }
    return false;
  }

  private async listConversationsByPublicApi(companyId: string, selectedInboxIdentifier: string | null) {
    const clients = await this.clientRepository.find({
      where: { company: { id: companyId } },
      select: { name: true, whatsapp: true, createdAt: true },
      order: { createdAt: 'DESC' },
      take: 40,
    });

    if (!selectedInboxIdentifier) return { data: [] };

    const results = await Promise.all(
      clients.map(async (client) => {
        const identifier = this.normalizePhone(client.whatsapp ?? '');
        if (!identifier) return [];

        const rows = await this.chatwootPublicRequest(
          selectedInboxIdentifier,
          identifier,
          '/conversations',
        );

        const list = Array.isArray(rows) ? rows : [];
        return list.map((item: any) => ({
          id: item?.id,
          status: item?.status ?? 'open',
          inboxId: null,
          contactName: client.name ?? identifier,
          phone: client.whatsapp ?? identifier,
          labels: [],
          assigneeName: null,
          teamName: null,
          lastMessage: item?.last_non_activity_message?.content ?? '',
          unreadCount: Number(item?.unread_count ?? 0),
          updatedAt: item?.updated_at ?? item?.created_at ?? null,
          contactIdentifier: identifier,
          inboxIdentifier: selectedInboxIdentifier,
        }));
      }),
    );

    return { data: results.flat() };
  }

  private async chatwootPublicRequest(
    inboxIdentifier: string,
    contactIdentifier: string,
    tail: string,
  ) {
    try {
      const response = await fetch(
        `${this.defaultBaseUrl}/public/api/v1/inboxes/${inboxIdentifier}/contacts/${contactIdentifier}${tail}`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } },
      );
      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
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

  private extractConversationRows(data: any): any[] {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.payload)) return data.payload;
    if (Array.isArray(data?.conversation)) return data.conversation;
    if (Array.isArray(data?.conversations)) return data.conversations;
    if (Array.isArray(data?.meta?.payload)) return data.meta.payload;
    return [];
  }

  private async invalidateAccountCache(account: string) {
    await this.redisService.delByPrefix(`chatwoot:${account}:`);
  }

  private normalizePhone(phone: string) {
    return String(phone ?? '').replace(/\D/g, '');
  }
}
