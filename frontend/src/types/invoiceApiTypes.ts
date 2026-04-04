export type BatchStatus = 'success' | 'partial' | 'error';

export type InvoiceStatus =
  | 'A Receber'
  | 'Pago'
  | 'Renegociado'
  | 'Perdido';

export type InvoicesStatus = 'success' | 'error';

export type CodePixStatus = 'success' | 'error';

export type InvoiceRuleOperator =
  | 'greater_than'
  | 'less_than'
  | 'greater_or_equal'
  | 'less_or_equal';

export interface InvoiceRuleFilter {
  operator: InvoiceRuleOperator;
  days?: number;
  daysFrom: number;
  daysTo: number;
  referenceDate: string;
  referenceDates?: string[];
  recurringType?: 'range' | 'monthly_days' | 'single';
}

export interface CodePix {
  status: CodePixStatus;
  pix: string;
  pix_key?: string;
  pix_key_type?: string;
}

export interface Invoice {
  invoice_id: string;
  contract_id: string;
  invoice_due_date: string; // pode tipar como Date se transformar no front
  invoice_amount: string;   // pode virar number se tratar
  invoice_status: InvoiceStatus;
  ticket_digitable_line: string | null;
  ticket_pdf_link: string | null;
  code_pix: CodePix | null;
}

export interface InvoicesResponse {
  status: InvoicesStatus;
  message: string;
  list: Invoice[];
}

export interface InvoiceClientCompany {
  id: string;
  name: string;
  account: string;
}

export interface InvoiceClientData {
  id: string;
  clientId: string;
  cnpj_cpf: string;
  name: string;
  whatsapp: string;
  email?: string | null;
  company: InvoiceClientCompany;
}

export interface ResultInvoices {
  clientData: InvoiceClientData;
  client: string;
  document: string;
  erp: string;
  dispatchDate?: string | null;
  invoices: InvoicesResponse;
}

export interface InvoiceError {
  document: string;
  reason: string;
}

export interface InvoiceBatchResponse {
  status: BatchStatus;
  message: string;
  data: ResultInvoices[];
  errors?: InvoiceError[];
}

export interface OverdueClientsSearchResponse {
  data: Array<{
    id: string;
    cnpj_cpf: string;
    name: string;
    whatsapp?: string;
    email?: string;
    clientId?: string;
    services?: Array<{
      id: string;
      id_servico: string;
      status: string;
      name: string;
    }>;
    company?: InvoiceClientCompany | null;
    invoices: InvoicesResponse;
  }>;
  page: number;
  limit: number;
  total: number;
  summary: {
    totalOverdueClients: number;
    totalOverdueInvoices: number;
    totalDebt: number;
    mappedClients: number;
    checkedClients: number;
    clientsWithSnapshot: number;
    clientsWithOpenInvoices: number;
  };
}

export interface InvoiceSyncState {
  companyId: string;
  companyName: string;
  account: string;
  status: 'idle' | 'running' | 'success' | 'error';
  message?: string | null;
  invoicesSynced: number;
  lastStartedAt?: string | null;
  lastFinishedAt?: string | null;
  lastSuccessAt?: string | null;
  durationMs?: number | null;
  updatedAt?: string | null;
}
