import { Api } from "../api";
import type {
  ChatwootAgent,
  ChatwootBootstrapResponse,
  ChatwootContactDetails,
  ChatwootConversationItem,
  ChatwootMessageItem,
  ChatwootTeam,
} from "../../types/chatwootApiTypes";

export class ChatwootClientService {
  static async getBootstrap(account: string | null): Promise<ChatwootBootstrapResponse> {
    if (!account) throw new Error("Account não encontrada na URL.");
    const { data } = await Api.get<ChatwootBootstrapResponse>(
      `/chatwoot/bootstrap?account=${account}&_ts=${Date.now()}`,
      { headers: { "Cache-Control": "no-cache", Pragma: "no-cache" } }
    );
    return data;
  }

  static async listConversations(
    account: string,
    params?: { status?: string; inboxIdentifier?: string; teamId?: number | string | null }
  ): Promise<ChatwootConversationItem[]> {
    const search = new URLSearchParams({ account });
    if (params?.status) search.set("status", params.status);
    if (params?.inboxIdentifier) search.set("inboxIdentifier", params.inboxIdentifier);
    if (params?.teamId != null) search.set("teamId", String(params.teamId));

    search.set("_ts", String(Date.now()));
    const { data } = await Api.get<{ data: ChatwootConversationItem[] }>(`/chatwoot/conversations?${search.toString()}`, {
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    return Array.isArray(data?.data) ? data.data : [];
  }

  static async listMessages(
    account: string,
    conversationId: number,
    options?: { inboxIdentifier?: string | null; contactIdentifier?: string | null }
  ): Promise<ChatwootMessageItem[]> {
    const query = new URLSearchParams({ account });
    if (options?.inboxIdentifier) query.set("inboxIdentifier", options.inboxIdentifier);
    if (options?.contactIdentifier) query.set("contactIdentifier", options.contactIdentifier);
    query.set("_ts", String(Date.now()));
    const { data } = await Api.get<{ data: ChatwootMessageItem[] }>(
      `/chatwoot/conversations/${conversationId}/messages?${query.toString()}`,
      { headers: { "Cache-Control": "no-cache", Pragma: "no-cache" } }
    );
    return Array.isArray(data?.data) ? data.data : [];
  }

  static async listConversationLabels(account: string, conversationId: number): Promise<string[]> {
    const { data } = await Api.get<{ data: string[] }>(
      `/chatwoot/conversations/${conversationId}/labels?account=${account}&_ts=${Date.now()}`,
      { headers: { "Cache-Control": "no-cache", Pragma: "no-cache" } }
    );
    return Array.isArray(data?.data) ? data.data : [];
  }

  static async listAccountLabels(account: string): Promise<string[]> {
    const { data } = await Api.get<{ data: string[] }>(
      `/chatwoot/labels?account=${account}&_ts=${Date.now()}`,
      { headers: { "Cache-Control": "no-cache", Pragma: "no-cache" } }
    );
    return Array.isArray(data?.data) ? data.data : [];
  }

  static async listContactLabels(account: string, contactId: number): Promise<string[]> {
    const { data } = await Api.get<{ data: string[] }>(
      `/chatwoot/contacts/${contactId}/labels?account=${account}&_ts=${Date.now()}`,
      { headers: { "Cache-Control": "no-cache", Pragma: "no-cache" } }
    );
    return Array.isArray(data?.data) ? data.data : [];
  }

  static async getContactDetails(account: string, contactId: number): Promise<ChatwootContactDetails | null> {
    const { data } = await Api.get<{ data: ChatwootContactDetails }>(
      `/chatwoot/contacts/${contactId}?account=${account}&_ts=${Date.now()}`,
      { headers: { "Cache-Control": "no-cache", Pragma: "no-cache" } }
    );
    return data?.data ?? null;
  }

  static async sendMessage(
    account: string,
    conversationId: number,
    content: string,
    options?: { inboxIdentifier?: string | null; contactIdentifier?: string | null }
  ) {
    const query = new URLSearchParams({ account });
    if (options?.inboxIdentifier) query.set("inboxIdentifier", options.inboxIdentifier);
    if (options?.contactIdentifier) query.set("contactIdentifier", options.contactIdentifier);
    const { data } = await Api.post<ChatwootMessageItem>(
      `/chatwoot/conversations/${conversationId}/messages?${query.toString()}`,
      { content }
    );
    return data;
  }

  static async updateStatus(
    account: string,
    conversationId: number,
    status: "open" | "resolved" | "pending" | "snoozed"
  ) {
    await Api.patch(`/chatwoot/conversations/${conversationId}/status?account=${account}`, { status });
  }

  static async transferConversation(
    account: string,
    conversationId: number,
    payload: { teamId?: number | null; assigneeId?: number | null }
  ) {
    await Api.patch(`/chatwoot/conversations/${conversationId}/assign?account=${account}`, payload);
  }

  static async updateLabels(
    account: string,
    conversationId: number,
    labels: string[],
  ) {
    await Api.patch(`/chatwoot/conversations/${conversationId}/labels?account=${account}`, { labels });
  }

  static async updateContactLabels(
    account: string,
    contactId: number,
    labels: string[],
  ) {
    await Api.patch(`/chatwoot/contacts/${contactId}/labels?account=${account}`, { labels });
  }

  static async listTeams(account: string): Promise<ChatwootTeam[]> {
    const { data } = await Api.get<{ data: ChatwootTeam[] }>(
      `/chatwoot/teams?account=${account}&_ts=${Date.now()}`,
      { headers: { "Cache-Control": "no-cache", Pragma: "no-cache" } }
    );
    return Array.isArray(data?.data) ? data.data : [];
  }

  static async listAgents(account: string): Promise<ChatwootAgent[]> {
    const { data } = await Api.get<{ data: ChatwootAgent[] }>(
      `/chatwoot/agents?account=${account}&_ts=${Date.now()}`,
      { headers: { "Cache-Control": "no-cache", Pragma: "no-cache" } }
    );
    return Array.isArray(data?.data) ? data.data : [];
  }
}
