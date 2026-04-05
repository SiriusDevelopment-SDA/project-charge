import { normalizeLabels } from "./chatwootHelpers";
import type {
  ChatwootConversationItem,
  ChatwootMessageItem,
} from "../../../types/chatwootApiTypes";

const CONVERSATIONS_CACHE_TTL_MS = 30_000;
const MESSAGES_CACHE_TTL_MS = 60_000;

type TimedStoragePayload<T> = {
  savedAt: number;
  data: T;
};

function getReadStateStorageKey(account: string) {
  return `chatwoot_read_conversations:${account}`;
}

function getContactLabelsStorageKey(account: string, contactId: number) {
  return `chatwoot_contact_labels:${account}:${contactId}`;
}

function getLastConversationStorageKey(account: string) {
  return `chatwoot_last_conversation:${account}`;
}

function getConversationCacheStorageKey(account: string, teamId?: string | null) {
  return `chatwoot_cached_conversations:${account}:${teamId || "all"}`;
}

function getMessageCacheStorageKey(account: string, conversationId: number) {
  return `chatwoot_cached_messages:${account}:${conversationId}`;
}

function loadTimedStoragePayload<T>(key: string, ttlMs: number): T | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as TimedStoragePayload<T>;
    const savedAt = Number(parsed?.savedAt ?? 0);

    if (!Number.isFinite(savedAt) || Date.now() - savedAt > ttlMs) {
      window.sessionStorage.removeItem(key);
      return null;
    }

    return parsed?.data ?? null;
  } catch {
    return null;
  }
}

function persistTimedStoragePayload<T>(key: string, data: T) {
  if (typeof window === "undefined") return;

  window.sessionStorage.setItem(
    key,
    JSON.stringify({
      savedAt: Date.now(),
      data,
    } satisfies TimedStoragePayload<T>),
  );
}

export function loadStoredReadConversationIds(account: string) {
  if (typeof window === "undefined" || !account) return new Set<number>();

  try {
    const raw = window.sessionStorage.getItem(getReadStateStorageKey(account));
    const parsed = raw ? JSON.parse(raw) : [];

    return new Set(
      Array.isArray(parsed)
        ? parsed
            .map((item) => Number(item))
            .filter((item) => Number.isFinite(item) && item > 0)
        : [],
    );
  } catch {
    return new Set<number>();
  }
}

export function persistReadConversationIds(account: string, ids: Set<number>) {
  if (typeof window === "undefined" || !account) return;

  window.sessionStorage.setItem(
    getReadStateStorageKey(account),
    JSON.stringify(Array.from(ids)),
  );
}

export function loadStoredContactLabels(account: string, contactId: number) {
  if (typeof window === "undefined" || !account || !contactId) return [];

  try {
    const raw = window.sessionStorage.getItem(
      getContactLabelsStorageKey(account, contactId),
    );
    const parsed = raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed)
      ? normalizeLabels(parsed.map((label) => String(label)))
      : [];
  } catch {
    return [];
  }
}

export function persistStoredContactLabels(
  account: string,
  contactId: number,
  labels: string[],
) {
  if (typeof window === "undefined" || !account || !contactId) return;

  window.sessionStorage.setItem(
    getContactLabelsStorageKey(account, contactId),
    JSON.stringify(normalizeLabels(labels)),
  );
}

export function loadStoredLastConversationId(account: string) {
  if (typeof window === "undefined" || !account) return null;

  try {
    const raw = window.sessionStorage.getItem(getLastConversationStorageKey(account));
    const parsed = Number(raw);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function persistStoredLastConversationId(account: string, conversationId: number) {
  if (typeof window === "undefined" || !account || !conversationId) return;

  window.sessionStorage.setItem(
    getLastConversationStorageKey(account),
    String(conversationId),
  );
}

export function loadStoredConversationCache(account: string, teamId?: string | null) {
  if (!account) return [] as ChatwootConversationItem[];

  const data = loadTimedStoragePayload<ChatwootConversationItem[]>(
    getConversationCacheStorageKey(account, teamId),
    CONVERSATIONS_CACHE_TTL_MS,
  );

  return Array.isArray(data) ? data : [];
}

export function persistStoredConversationCache(
  account: string,
  teamId: string | null | undefined,
  conversations: ChatwootConversationItem[],
) {
  if (!account) return;

  persistTimedStoragePayload(
    getConversationCacheStorageKey(account, teamId),
    Array.isArray(conversations) ? conversations : [],
  );
}

export function loadStoredMessageCache(account: string, conversationId: number) {
  if (!account || !conversationId) return [] as ChatwootMessageItem[];

  const data = loadTimedStoragePayload<ChatwootMessageItem[]>(
    getMessageCacheStorageKey(account, conversationId),
    MESSAGES_CACHE_TTL_MS,
  );

  return Array.isArray(data) ? data : [];
}

export function persistStoredMessageCache(
  account: string,
  conversationId: number,
  messages: ChatwootMessageItem[],
) {
  if (!account || !conversationId) return;

  persistTimedStoragePayload(
    getMessageCacheStorageKey(account, conversationId),
    Array.isArray(messages) ? messages : [],
  );
}
