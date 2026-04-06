export type PaymentPromiseStatus = 'pending' | 'kept' | 'broken' | 'cancelled';

export type PaymentPromise = {
  id: string;
  client_id: string;
  total_debt: number;
  open_invoices_count: number;
  promised_payment_date: string;
  promised_amount?: number | null;
  reminder_sent: boolean;
  reminder_sent_at?: string | null;
  status: PaymentPromiseStatus;
  company_id?: string | null;
  phone?: string | null;
  client_name?: string | null;
  service_report?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type CreatePaymentPromisePayload = {
  client_id: string;
  total_debt: number;
  open_invoices_count: number;
  promised_payment_date: string;
  promised_amount?: number;
  company_id?: string;
  phone?: string;
  client_name?: string;
  service_report?: string;
};

export type InteractionType = 'call' | 'whatsapp' | 'email' | 'visit' | 'other';
export type InteractionOutcome =
  | 'payment_promise'
  | 'no_contact'
  | 'agreement'
  | 'refused'
  | 'other';

export type ClientInteraction = {
  id: string;
  client_id: string;
  company_id: string;
  agent_id?: string | null;
  agent?: { id: string; name: string } | null;
  type?: InteractionType | null;
  description?: string | null;
  outcome?: InteractionOutcome | null;
  scheduled_at?: string | null;
  payment_promise_id?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type CreateClientInteractionPayload = {
  client_id: string;
  company_id: string;
  agent_id?: string;
  type?: InteractionType;
  description?: string;
  outcome?: InteractionOutcome;
  scheduled_at?: string;
  payment_promise_id?: string;
};

export type DispatchSummary = {
  total: number;
  last_sent_at: string | null;
};

/** Retorno do endpoint POST /payment-promise/latest-batch */
export type LatestPromiseBatchResponse = PaymentPromise[];

/** Retorno do endpoint POST /client-interaction/dispatches/summary-batch */
export type DispatchSummaryBatchResponse = Record<string, DispatchSummary>;
