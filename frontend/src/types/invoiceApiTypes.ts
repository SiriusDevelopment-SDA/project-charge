export type BatchStatus = 'success' | 'partial' | 'error';

export type InvoiceStatus =
  | 'A Receber'
  | 'Pago'
  | 'Renegociado'
  | 'Perdido';

export type InvoicesStatus = 'success' | 'error';

export type CodePixStatus = 'success' | 'error';

export interface CodePix {
  status: CodePixStatus;
  pix: string;
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
export interface ResultInvoices {
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
