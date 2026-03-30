import type { SetStateAction } from "react";
import type { Cliente } from "./clientApiTypes";
import type { Lead } from "./componentsTypes";
import type { Template } from "./templateApiTypes";



export interface IDispatchTemplateContext {
  setSelectedClientes: React.Dispatch<SetStateAction<Cliente[]>>;
  setSelectedLeads: React.Dispatch<SetStateAction<Lead[]>>;
  setSelectedTemplate: React.Dispatch<SetStateAction<Template | null>>;
  selectedClientes: Cliente[];
  selectedLeads: Lead[];
  selectedTemplate: Template | null;
  templateMapVars: mappedVars[] | null;
  setModoPage: React.Dispatch<SetStateAction<"clientes" | "leads">>;
  modoPage: "clientes" | "leads";
  sendTemplate: (extraLeads?: Lead[]) => Promise<void>;
  isSending: boolean;
  activeDispatchBatch: DispatchBatchStatus | null;
  clearActiveDispatchBatch: () => void;
}

export type DispatchBatchStatus = {
  id: string;
  companyId: string;
  campaignId?: string | null;
  templateId?: string | null;
  templateName?: string | null;
  status: 'queued' | 'processing' | 'completed' | 'partial' | 'failed';
  totalRecipients: number;
  processedRecipients: number;
  progressPercentage: number;
  successCount: number;
  failedCount: number;
  rateLimitPerSecond: number;
  errorMessage?: string | null;
  estimatedDurationSeconds?: number;
  scope: 'manual' | 'campaign';
  startedAt?: string | Date | null;
  finishedAt?: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type mappedVars = {
  [key: string]: string | undefined;
  dispatchDate?: string;
  nome_cliente?: string;
  nome_atendente?: string;
  data_vencimento_fatura?: string;
  whatsapp?: string;
  nome_empresa?: string;
  numero_contrato?: string;
  valor_fatura?: string;
  linha_digitavel_boleto?: string;
  link_boleto_pdf?: string;
  code_pix?: string;
  codigo_qr?: string;
  codigo_qr_code?: string;
  codigo_pix?: string;
  mensagem?: string;
  cnpj_cpf?: string;
  /** ORDER_DETAILS button fields */
  order_reference_id?: string;
  order_item_name?: string;
  order_item_description?: string;
  order_pix_merchant_name?: string;
  /** PIX key of the merchant (CNPJ, CPF, e-mail ou telefone) */
  order_pix_key?: string;
  order_pix_key_type?: string;
};
