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
  days: number;
  referenceDate: string;
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
