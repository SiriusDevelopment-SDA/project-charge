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
    invoice_amount: number;
    invoice_status: 'A Receber' | 'Pago' | 'Renegociado' | 'Pendente';
    boleto_digitable_line: string;
    boleto_pdf_link: string;
    code_pix: string;
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
  