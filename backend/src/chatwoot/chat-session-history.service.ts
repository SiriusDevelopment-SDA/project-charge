import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, type QueryDeepPartialEntity } from 'typeorm';
import { ChatSession } from './entities/chat-session.entity';
import { ChatSessionMessage } from './entities/chat-session-message.entity';

export type ChatSessionSnapshot = {
  id: number | null;
  status?: string | null;
  inboxId?: number | null;
  contactId?: number | null;
  assigneeId?: number | null;
  teamId?: number | null;
  contactName?: string | null;
  phone?: string | null;
  labels?: string[];
  assigneeName?: string | null;
  teamName?: string | null;
  lastMessage?: string | null;
  protocol?: string | null;
  generatedProtocol?: boolean;
  report?: string | null;
  unreadCount?: number | null;
  updatedAt?: string | Date | null;
  contactIdentifier?: string | null;
  inboxIdentifier?: string | null;
};

export type ChatSessionMessageSnapshot = {
  id: number | null;
  content?: string | null;
  senderType?: string | null;
  senderName?: string | null;
  messageType?: number | null;
  isPrivate?: boolean;
  createdAt?: string | Date | null;
};

type ConversationSyncRow = {
  snapshot: ChatSessionSnapshot;
  rawPayload?: unknown;
};

type MessageSyncRow = {
  conversationId: number;
  snapshot: ChatSessionMessageSnapshot;
  rawPayload?: unknown;
};

@Injectable()
export class ChatSessionHistoryService {
  constructor(
    @InjectRepository(ChatSession)
    private readonly sessionRepository: Repository<ChatSession>,
    @InjectRepository(ChatSessionMessage)
    private readonly sessionMessageRepository: Repository<ChatSessionMessage>,
  ) {}

  async listConversations(input: {
    companyId: string;
    status?: string | null;
    teamId?: string | number | null;
  }): Promise<ChatSession[]> {
    const where: Record<string, unknown> = { companyId: input.companyId };

    if (input.status && input.status !== 'all') {
      where.status = input.status;
    }

    if (input.teamId != null) {
      const numericTeamId = Number(input.teamId);
      if (Number.isFinite(numericTeamId) && numericTeamId > 0) {
        where.externalTeamId = numericTeamId;
      }
    }

    return this.sessionRepository.find({
      where: where as any,
      order: { lastExternalUpdatedAt: 'DESC', createdAt: 'DESC' },
      take: 200,
    });
  }

  async listMessagesByConversation(input: {
    companyId: string;
    conversationId: number;
  }): Promise<ChatSessionMessage[]> {
    return this.sessionMessageRepository.find({
      where: {
        companyId: input.companyId,
        externalConversationId: input.conversationId,
      },
      order: { externalCreatedAt: 'ASC', createdAt: 'ASC' },
      take: 500,
    });
  }

  async syncAttendances(input: {
    companyId: string;
    account: string;
    rows: ConversationSyncRow[];
  }) {
    const rows: QueryDeepPartialEntity<ChatSession>[] = [];

    for (const { snapshot, rawPayload } of input.rows) {
      const mapped = this.mapAttendanceRow(input.companyId, input.account, snapshot, rawPayload);
      if (mapped) {
        rows.push(mapped);
      }
    }

    if (!rows.length) {
      return;
    }

    for (const chunk of this.chunk(rows, 200)) {
      await this.sessionRepository.upsert(chunk, ['companyId', 'externalConversationId']);
    }
  }

  async syncMessages(input: {
    companyId: string;
    account: string;
    rows: MessageSyncRow[];
  }) {
    const conversationIds = Array.from(
      new Set(
        input.rows
          .map((item) => this.toPositiveInteger(item.conversationId))
          .filter((value): value is number => value !== null),
      ),
    );

    const sessionMap = await this.loadSessionMap(input.companyId, conversationIds);
    const rows: QueryDeepPartialEntity<ChatSessionMessage>[] = [];

    for (const { conversationId, snapshot, rawPayload } of input.rows) {
      const mapped = this.mapMessageRow(
        input.companyId,
        input.account,
        conversationId,
        sessionMap.get(conversationId) ?? null,
        snapshot,
        rawPayload,
      );

      if (mapped) {
        rows.push(mapped);
      }
    }

    if (!rows.length) {
      return;
    }

    for (const chunk of this.chunk(rows, 400)) {
      await this.sessionMessageRepository.upsert(chunk, [
        'companyId',
        'externalConversationId',
        'externalMessageId',
      ]);
    }
  }

  async patchAttendance(input: {
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
    const externalConversationId = this.toPositiveInteger(input.conversationId);
    if (!externalConversationId) {
      return;
    }

    const payload = this.cleanUndefined({
      status: this.normalizeOptionalText(input.status) ?? undefined,
      externalAssigneeId: this.toPositiveInteger(input.assigneeId) ?? undefined,
      externalTeamId: this.toPositiveInteger(input.teamId) ?? undefined,
      labels: input.labels ? this.normalizeLabels(input.labels) : undefined,
      lastMessage: this.normalizeOptionalText(input.lastMessage),
      protocol: this.normalizeOptionalText(input.protocol),
      generatedProtocol:
        typeof input.generatedProtocol === 'boolean' ? input.generatedProtocol : undefined,
      report: this.normalizeOptionalText(input.report),
      unreadCount: this.normalizeCount(input.unreadCount) ?? undefined,
      lastExternalUpdatedAt: this.toDateOrNull(input.updatedAt),
      lastSyncedAt: new Date(),
      rawPayload: input.rawPayload !== undefined ? this.normalizeJson(input.rawPayload) : undefined,
    }) as QueryDeepPartialEntity<ChatSession>;

    const result = await this.sessionRepository.update(
      { companyId: input.companyId, externalConversationId },
      payload,
    );

    if (result.affected) {
      return;
    }

    await this.sessionRepository.insert({
      companyId: input.companyId,
      account: String(input.account ?? '').trim(),
      externalConversationId,
      status: this.normalizeOptionalText(input.status) ?? 'open',
      externalAssigneeId: this.toPositiveInteger(input.assigneeId),
      externalTeamId: this.toPositiveInteger(input.teamId),
      labels: this.normalizeLabels(input.labels ?? []),
      lastMessage: this.normalizeOptionalText(input.lastMessage),
      protocol: this.normalizeOptionalText(input.protocol),
      generatedProtocol: Boolean(input.generatedProtocol),
      report: this.normalizeOptionalText(input.report),
      unreadCount: this.normalizeCount(input.unreadCount) ?? 0,
      lastExternalUpdatedAt: this.toDateOrNull(input.updatedAt),
      lastSyncedAt: new Date(),
      rawPayload: this.normalizeJson(input.rawPayload),
    });
  }

  private mapAttendanceRow(
    companyId: string,
    account: string,
    snapshot: ChatSessionSnapshot,
    rawPayload?: unknown,
  ): QueryDeepPartialEntity<ChatSession> | null {
    const externalConversationId = this.toPositiveInteger(snapshot.id);
    if (!externalConversationId) {
      return null;
    }

    const normalizedPhone = this.normalizePhone(snapshot.phone);

    return {
      companyId,
      account: String(account ?? '').trim(),
      externalConversationId,
      externalContactId: this.toPositiveInteger(snapshot.contactId),
      externalInboxId: this.toPositiveInteger(snapshot.inboxId),
      externalAssigneeId: this.toPositiveInteger(snapshot.assigneeId),
      externalTeamId: this.toPositiveInteger(snapshot.teamId),
      status: this.normalizeOptionalText(snapshot.status) ?? 'open',
      contactName: this.normalizeOptionalText(snapshot.contactName),
      phone: this.normalizeOptionalText(snapshot.phone),
      normalizedPhone: normalizedPhone || null,
      contactIdentifier: this.normalizeOptionalText(snapshot.contactIdentifier),
      inboxIdentifier: this.normalizeOptionalText(snapshot.inboxIdentifier),
      assigneeName: this.normalizeOptionalText(snapshot.assigneeName),
      teamName: this.normalizeOptionalText(snapshot.teamName),
      labels: this.normalizeLabels(snapshot.labels ?? []),
      lastMessage: this.normalizeOptionalText(snapshot.lastMessage),
      protocol: this.normalizeOptionalText(snapshot.protocol),
      generatedProtocol: Boolean(snapshot.generatedProtocol),
      report: this.normalizeOptionalText(snapshot.report),
      unreadCount: this.normalizeCount(snapshot.unreadCount) ?? 0,
      lastExternalUpdatedAt: this.toDateOrNull(snapshot.updatedAt),
      lastSyncedAt: new Date(),
      rawPayload: this.normalizeJson(rawPayload),
    } satisfies Partial<ChatSession>;
  }

  private mapMessageRow(
    companyId: string,
    account: string,
    conversationId: number,
    sessionId: string | null,
    snapshot: ChatSessionMessageSnapshot,
    rawPayload?: unknown,
  ): QueryDeepPartialEntity<ChatSessionMessage> | null {
    const externalConversationId = this.toPositiveInteger(conversationId);
    const externalMessageId = this.toPositiveInteger(snapshot.id);

    if (!externalConversationId || !externalMessageId) {
      return null;
    }

    return {
      sessionId,
      companyId,
      account: String(account ?? '').trim(),
      externalConversationId,
      externalMessageId,
      content: this.normalizeOptionalText(snapshot.content),
      senderType: this.normalizeOptionalText(snapshot.senderType),
      senderName: this.normalizeOptionalText(snapshot.senderName),
      messageType: this.toIntegerOrNull(snapshot.messageType),
      isPrivate: Boolean(snapshot.isPrivate),
      externalCreatedAt: this.toDateOrNull(snapshot.createdAt),
      lastSyncedAt: new Date(),
      rawPayload: this.normalizeJson(rawPayload),
    } satisfies Partial<ChatSessionMessage>;
  }

  private async loadSessionMap(companyId: string, conversationIds: number[]) {
    if (!conversationIds.length) {
      return new Map<number, string>();
    }

    const rows = await this.sessionRepository.find({
      where: {
        companyId,
        externalConversationId: In(conversationIds),
      },
      select: {
        id: true,
        externalConversationId: true,
      },
    });

    return new Map(rows.map((item) => [item.externalConversationId, item.id]));
  }

  private normalizePhone(value: string | null | undefined) {
    const normalized = String(value ?? '').replace(/\D/g, '');
    return normalized || null;
  }

  private normalizeLabels(labels: string[]) {
    return Array.from(
      new Set(
        (labels ?? [])
          .map((item) => String(item ?? '').trim())
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right, 'pt-BR'));
  }

  private normalizeOptionalText(value: unknown) {
    const normalized = String(value ?? '').trim();
    return normalized || null;
  }

  private normalizeCount(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
  }

  private toPositiveInteger(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
  }

  private toIntegerOrNull(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }

  private toDateOrNull(value: unknown) {
    if (value == null || value === '') {
      return null;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      const normalized = value > 9999999999 ? value : value * 1000;
      const date = new Date(normalized);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private normalizeJson(value: unknown) {
    if (value == null) {
      return {};
    }

    if (Array.isArray(value) || typeof value === 'object') {
      return value as Record<string, any>;
    }

    return { value };
  }

  private cleanUndefined<T extends Record<string, unknown>>(value: T) {
    return Object.fromEntries(
      Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
    ) as Partial<T>;
  }

  private chunk<T>(rows: T[], size: number) {
    const chunks: T[][] = [];
    for (let index = 0; index < rows.length; index += size) {
      chunks.push(rows.slice(index, index + size));
    }
    return chunks;
  }
}
