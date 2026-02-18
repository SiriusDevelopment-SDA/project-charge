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
    sendTemplate: () => void
}
export type mappedVars = {
    nome_cliente?: string;
    nome_atendente?: string; // ✅ ADICIONAR
    data_vencimento_fatura?: string;
    whatsapp?: string;
    nome_empresa?: string;
    numero_contrato?: string;
    valor_fatura?: string;
    linha_digitavel_boleto?: string;
    link_boleto_pdf?: string;
    mensagem?: string;
    cnpj_cpf?: string;
  };