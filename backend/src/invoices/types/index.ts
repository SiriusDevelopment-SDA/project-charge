
export interface ResultInvoices {
    client: string;
    document: string;
    erp: string;
    invoices: InvoicesResponse
  }
export interface InvoiceMapResult {
    invoice_id: string;
    contract_id: string;
    invoice_due_date: string; // ou Date, se você converter
    invoice_amount: string;
    invoice_status: 'A Receber' | 'Pago' | 'Renegociado' | 'Pendente';
    ticket_digitable_line: string;
    ticket_pdf_link: string | null;
    code_pix: string | null;
  }
  
export interface InvoicesResponse {
  status: 'success' | 'error';
  message: string;
  invoices: InvoiceMapResult[];
}

export interface InvoiceBatchResponse {
    status: 'success' | 'partial' | 'error';
    message: string;
    data: ResultInvoices[];
    errors?: {
      document: string;
      reason: string;
    }[];
  }
  