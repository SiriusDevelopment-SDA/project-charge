export type ChatwootContact = {
  id: number;
  source_id: string;
  name?: string;
  email?: string;
  phone_number?: string;
  pubsub_token?: string;
};

export type ChatwootMessage = {
  id: number;
  content: string;
  message_type?: number;
  sender_type?: string;
  created_at?: number;
  content_type?: string;
};

export type ChatwootConversation = {
  id: number;
  inbox_id?: string | number;
  status?: string;
  messages?: ChatwootMessage[];
  contact?: ChatwootContact;
};

export type CreateContactPayload = {
  identifier?: string;
  identifier_hash?: string;
  name?: string;
  email?: string;
  phone_number?: string;
  custom_attributes?: Record<string, unknown>;
};

export type ChatwootInboxOption = {
  id: number;
  name: string;
  identifier: string;
};

export type ChatwootBootstrapContact = {
  id: string;
  name: string;
  phone: string;
  identifier: string;
};

export type ChatwootBootstrapResponse = {
  company: {
    id: string;
    name: string;
    account: string;
  };
  chatwoot: {
    baseUrl: string;
    inboxes: ChatwootInboxOption[];
    selectedInboxIdentifier: string | null;
    permissions?: {
      accountApi?: boolean;
    };
  };
  contacts: ChatwootBootstrapContact[];
};

export type ChatwootConversationItem = {
  id: number;
  status: string;
  inboxId: number | null;
  contactName: string;
  phone: string;
  labels: string[];
  assigneeName: string | null;
  teamName: string | null;
  lastMessage: string;
  unreadCount: number;
  updatedAt: number | string | null;
  contactIdentifier?: string | null;
  inboxIdentifier?: string | null;
};

export type ChatwootMessageItem = {
  id: number;
  content: string;
  senderType: string;
  createdAt: number | string | null;
};

export type ChatwootTeam = {
  id: number;
  name: string;
};

export type ChatwootAgent = {
  id: number;
  name: string;
};
