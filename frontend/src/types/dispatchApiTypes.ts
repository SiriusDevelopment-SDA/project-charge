import type { SetStateAction } from "react";
import type { Cliente } from "./clientApiTypes";
import type { Lead } from "./componentsTypes";
import type { Template } from "./templateApiTypes";

export type DispatchBatchStatus = {
  id: string;
  status: "queued" | "processing" | "completed" | "partial" | "failed";
  totalRecipients: number;
  processedRecipients: number;
  successCount: number;
  failedCount: number;
  rateLimitPerSecond: number;
  progressPercentage: number;
  estimatedDurationSeconds: number;
  startedAt?: string | Date | null;
  finishedAt?: string | Date | null;
  errorMessage?: string | null;
  templateId?: string | null;
  templateName?: string | null;
  campaignId?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

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

export type mappedVars = {
  [key: string]: string | undefined;
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
};
