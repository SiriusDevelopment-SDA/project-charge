import type {
  ChatwootConversationItem,
  ChatwootMessageItem,
} from "../../../types/chatwootApiTypes";

export type ChatwootQueue = "ia" | "human" | "done" | "all";
export type ChatwootConversationGroup = {
  key: string;
  primaryConversation: ChatwootConversationItem;
  conversations: ChatwootConversationItem[];
  unreadCount: number;
};

export const REALTIME_CONVERSATION_EVENTS = new Set([
  "conversation.created",
  "conversation.status_changed",
  "conversation.read",
  "assignee.changed",
  "team.changed",
  "conversation.contact_changed",
  "message.created",
  "message.updated",
]);

export function initials(name: string) {
  return (
    name
      .split(" ")
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function timeAgo(ts: number | string | null): string {
  if (!ts) return "";

  const ms = typeof ts === "number" ? ts * 1000 : new Date(ts).getTime();
  if (Number.isNaN(ms)) return "";

  const diff = Date.now() - ms;
  if (diff < 60_000) return "agora";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

export function formatConversationTime(ts: number | string | null) {
  if (!ts) return "--:--";

  const date =
    typeof ts === "number"
      ? new Date(ts * 1000)
      : new Date(ts);

  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function extractConversationId(data: Record<string, unknown> | null): number | null {
  if (!data) return null;

  const directId = Number(data.id);
  if (Number.isFinite(directId) && directId > 0) return directId;

  const nestedConversation = data.conversation;
  if (nestedConversation && typeof nestedConversation === "object") {
    const nestedId = Number((nestedConversation as { id?: unknown }).id);
    if (Number.isFinite(nestedId) && nestedId > 0) return nestedId;
  }

  const messageConversationId = Number(
    (data as { conversation_id?: unknown }).conversation_id,
  );

  return Number.isFinite(messageConversationId) && messageConversationId > 0
    ? messageConversationId
    : null;
}

export function normalizeLabels(labels: string[]) {
  return Array.from(
    new Set((labels ?? []).map((label) => String(label).trim()).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right, "pt-BR"));
}

export function areLabelsDifferent(currentLabels: string[], initialLabels: string[]) {
  const current = normalizeLabels(currentLabels);
  const initial = normalizeLabels(initialLabels);

  return (
    current.length !== initial.length ||
    current.some((label, index) => label !== initial[index])
  );
}

export function isHumanPickupConversation(conversation: ChatwootConversationItem) {
  return conversation.status === "open" && !conversation.assigneeName;
}

export function isIaConversation(conversation: ChatwootConversationItem) {
  return conversation.status === "pending";
}

export function isBotMessage(message: ChatwootMessageItem) {
  const normalizedSenderName = String(message.senderName ?? "").trim().toLowerCase();

  return (
    message.senderType === "agent_bot" ||
    message.senderType === "bot" ||
    normalizedSenderName.includes("agente virtual") ||
    normalizedSenderName.includes("supervisor") ||
    normalizedSenderName.includes("agent bot") ||
    normalizedSenderName.includes("bot") ||
    message.content.includes("***Mensagem automática") ||
    message.content.includes("***Mensagem automatica")
  );
}

export function isAgentMessage(message: ChatwootMessageItem) {
  const normalizedContent = String(message.content ?? "").trim().toLowerCase();
  const looksLikeSystemEvent =
    normalizedContent.startsWith("conversa foi marcada como resolvida") ||
    normalizedContent.startsWith("conversa desatribuída") ||
    normalizedContent.startsWith("conversa desatribuida") ||
    normalizedContent.includes("atribuiu a si mesmo essa conversa") ||
    normalizedContent.includes("adicionou ") ||
    normalizedContent.includes("definiu a prioridade") ||
    normalizedContent.includes("marcou esta conversa") ||
    normalizedContent.includes("assigned this conversation") ||
    normalizedContent.includes("resolved by") ||
    normalizedContent.includes("priority to");

  return message.senderType === "agent" || isBotMessage(message) || looksLikeSystemEvent;
}

export function getConversationSearchText(conversation: ChatwootConversationItem) {
  return `${conversation.contactName} ${conversation.phone} ${conversation.lastMessage} ${conversation.protocol ?? ""} ${conversation.report ?? ""}`.toLowerCase();
}

export function formatConversationProtocol(conversation: ChatwootConversationItem) {
  const protocol = String(conversation.protocol ?? "").trim();
  return protocol || "AUTO-00000000-000000";
}

export function deduplicateMessages(messages: ChatwootMessageItem[]): ChatwootMessageItem[] {
  const seen = new Set<number>();
  return messages.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

export function sortMessagesByTime(messages: ChatwootMessageItem[]) {
  const normalizeTimestamp = (value: number | string | null | undefined) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    const timestamp = new Date(String(value ?? "")).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  };

  return [...messages].sort((left, right) => {
    const leftTs = normalizeTimestamp(left.createdAt);
    const rightTs = normalizeTimestamp(right.createdAt);

    if (leftTs !== rightTs) {
      return leftTs - rightTs;
    }

    return Number(left.id ?? 0) - Number(right.id ?? 0);
  });
}

export function normalizeRealtimeConversation(
  data: Record<string, unknown>,
): ChatwootConversationItem | null {
  // Suporta payloads completos (conversation.created, conversation.status_changed)
  // e parciais (assignee.changed, team.changed, etc.)
  const raw = data as Record<string, unknown>;

  // O ID da conversa pode estar em data.id, data.conversation.id ou data.conversation_id
  const conv = raw.conversation as Record<string, unknown> | undefined;
  const directId = Number(raw.id ?? null);
  const nestedId = Number(conv?.id ?? null);
  const id = Number.isFinite(directId) && directId > 0
    ? directId
    : Number.isFinite(nestedId) && nestedId > 0 ? nestedId : null;

  if (!id) return null;

  // Para eventos parciais como assignee.changed, a raiz do payload é o objeto assignee/team/etc.
  // A conversa completa pode estar em data.conversation ou o próprio data é a conversa.
  const convObj: Record<string, unknown> = (
    conv && typeof conv === "object" && Number(conv.id) === id ? conv : raw
  );

  const meta = convObj.meta as Record<string, unknown> | undefined;
  const sender = meta?.sender as Record<string, unknown> | undefined;
  const assignee = meta?.assignee as Record<string, unknown> | undefined;
  const team = meta?.team as Record<string, unknown> | undefined;
  const lastMsg = convObj.last_non_activity_message as Record<string, unknown> | undefined;
  const attrs = (convObj.additional_attributes ?? {}) as Record<string, unknown>;

  const contactName = String(sender?.name ?? "").trim() || `Conversa #${id}`;
  const status = String(convObj.status ?? raw.status ?? "open");
  const unreadCount = Number(convObj.unread_count ?? raw.unread_count ?? 0);

  return {
    id,
    status,
    inboxId: Number(convObj.inbox_id ?? null) || null,
    contactId: Number(sender?.id ?? null) || null,
    contactName,
    phone: String(sender?.phone_number ?? "").trim(),
    labels: Array.isArray(convObj.labels)
      ? (convObj.labels as unknown[]).map(String)
      : [],
    assigneeName: String(assignee?.name ?? "").trim() || null,
    teamName: String(team?.name ?? "").trim() || null,
    lastMessage: String(lastMsg?.content ?? "").trim(),
    protocol: String(attrs.protocol ?? "").trim() || null,
    report: String(attrs.report ?? "").trim() || null,
    generatedProtocol: Boolean(attrs.generated_protocol),
    unreadCount,
    updatedAt: (convObj.last_activity_at ?? raw.last_activity_at ?? null) as number | string | null,
    contactIdentifier: String(sender?.identifier ?? "").trim() || null,
    inboxIdentifier: null,
  };
}

export function normalizeRealtimeMessage(
  data: Record<string, unknown>,
): ChatwootMessageItem | null {
  const id = Number(data.id);
  if (!Number.isFinite(id) || id <= 0) return null;

  const content = String(data.content ?? "");
  const rawCreatedAt = data.created_at;
  const createdAt: number | string | null =
    typeof rawCreatedAt === "number" || typeof rawCreatedAt === "string"
      ? rawCreatedAt
      : null;

  const senderRaw = data.sender as Record<string, unknown> | null | undefined;
  const senderType = (() => {
    const raw = String(
      data.sender_type ?? senderRaw?.type ?? senderRaw?.role ?? "",
    ).toLowerCase();
    if (raw === "agent_bot" || raw === "bot") return "agent_bot";
    if (
      raw === "agent" ||
      raw === "user" ||
      raw === "administrator" ||
      raw === "admin"
    )
      return "agent";
    if (Number(data.message_type) === 1) return "agent";
    return "contact";
  })();

  const senderName =
    String(
      senderRaw?.name ??
        senderRaw?.available_name ??
        senderRaw?.display_name ??
        senderRaw?.email ??
        "",
    ).trim() || null;

  return { id, content, senderType, senderName, createdAt };
}

function normalizeConversationTimestamp(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const timestamp = new Date(String(value ?? "")).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeConversationPhone(phone: string | null | undefined) {
  return String(phone ?? "").replace(/\D/g, "");
}

function getConversationGroupingKey(conversation: ChatwootConversationItem) {
  const contactId = Number(conversation.contactId ?? 0);
  if (Number.isFinite(contactId) && contactId > 0) {
    return `contact:${contactId}`;
  }

  const identifier = String(conversation.contactIdentifier ?? "").trim().toLowerCase();
  if (identifier) {
    return `identifier:${identifier}`;
  }

  const normalizedPhone = normalizeConversationPhone(conversation.phone);
  if (normalizedPhone) {
    return `phone:${normalizedPhone}`;
  }

  const normalizedName = String(conversation.contactName ?? "").trim().toLowerCase();
  if (normalizedName) {
    return `name:${normalizedName}`;
  }

  return `conversation:${conversation.id}`;
}

export function groupConversationsByClient(conversations: ChatwootConversationItem[]) {
  const grouped = new Map<string, ChatwootConversationItem[]>();

  for (const conversation of conversations) {
    const key = getConversationGroupingKey(conversation);
    const current = grouped.get(key);
    if (current) {
      current.push(conversation);
      continue;
    }

    grouped.set(key, [conversation]);
  }

  return Array.from(grouped.entries())
    .map(([key, rows]) => {
      const sortedRows = [...rows].sort(
        (left, right) =>
          normalizeConversationTimestamp(right.updatedAt) -
          normalizeConversationTimestamp(left.updatedAt),
      );
      const primaryConversation = sortedRows[0];

      return {
        key,
        primaryConversation: {
          ...primaryConversation,
          labels: normalizeLabels(
            sortedRows.flatMap((conversation) => conversation.labels ?? []),
          ),
        },
        conversations: sortedRows,
        unreadCount: sortedRows.reduce(
          (total, conversation) => total + Number(conversation.unreadCount ?? 0),
          0,
        ),
      } satisfies ChatwootConversationGroup;
    })
    .sort(
      (left, right) =>
        normalizeConversationTimestamp(right.primaryConversation.updatedAt) -
        normalizeConversationTimestamp(left.primaryConversation.updatedAt),
    );
}
