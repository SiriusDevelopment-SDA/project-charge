// IMPORT TYPE INPUTS

import type { Dispatch, ReactNode, SetStateAction } from "react";

export type MyInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};
export type Template = {
  id: string;
  name: string;
  message: string;
  category: string;
  active: boolean;
  company: company;
  meta_status: string;
  createdAt: Date;
  updatedAt: Date;
  variables: Record<string, string>;
};

export type propTemplate = {
  setOpenState: React.Dispatch<React.SetStateAction<boolean>>;
  open: boolean;
  FilterButtonProp: true | false;
  templates: Template[]
  setTemplateSelecionado: React.Dispatch<React.SetStateAction<Template>>;
  templateSelecionado: Template | undefined
};
type invoices = {
 id_fatura: string,
 contratoId: string,
 data_vencimento_fatura: string,
 valor_fatura: string,
 status: string,
 Referencia?: string,
 linha_digitavel_boleto?: string
 link_boleto_pdf?: string
}
type company = {
  id: string;
  name: string;
  account: string
}
export type Cliente = {
  id: string;
  cnpj_cpf: string;
  name: string;
  street?: string;
  city?: string;
  numberHouse?: string;
  zipCode?: string;
  clientId?: string;
  whatsapp?: string;
  email?: string;
  createdAt?: Date;
  updatedAt?: Date;
  invoices?: invoices[];
  services?: [];
  company?: company;
}
export type Lead = {
  [key: string]: any;
  nome_cliente?: string;
}
export type PropsSelect = {
  children: ReactNode | string;
  className?: string;
  disabled?: boolean;
  value?: string[];
  setSelected: Dispatch<React.SetStateAction<Cliente[]>>;
  selected: Cliente[];
  setOpen?: Dispatch<React.SetStateAction<boolean>>;
  open?: boolean;
  clientes: Cliente[];
};

export type responseClients = {
  data: Cliente[];
  limit: number;
  page: number;
  total: number;
}
export type responseTemplate = {
  data: Template[];
  limit: number;
  page: number;
  total: number;
}

export interface IClientsContext {
  clients: Cliente[] | [];
  setQuery: React.Dispatch<SetStateAction<string>>
  setPage: React.Dispatch<SetStateAction<number>>;
  setLimit: React.Dispatch<SetStateAction<number>>;
  setOrder: React.Dispatch<SetStateAction<"DESC" | "ASC">>;
  setGroupInvoices: React.Dispatch<SetStateAction<boolean>>;
  fetchInvoices: (client: Cliente[]) => void;
}
export interface ITemplatesContext {
  templates: Template[] | [];
  categoryTemplateFilter: string | null;
  setCategoryTemplateFilter: React.Dispatch<SetStateAction<string | null>>;
  searchTemplateName: string;
  setSearchTemplateName: React.Dispatch<SetStateAction<string>>;
  setQuery: React.Dispatch<SetStateAction<string>>;
  setPage: React.Dispatch<SetStateAction<number>>;
  setLimit: React.Dispatch<SetStateAction<number>>;
  setOrder: React.Dispatch<SetStateAction<"DESC" | "ASC">>;
}
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
export type FilterButtonProps = {
  templates: Template[];
  selectedCategory?: string
  setSelectedCategory: React.Dispatch<SetStateAction<string>>
  onCategoryChange?: (categoria: string) => void;
};

export type Historico = {
  id: string;
  cliente_name?: string;
  cliente_document?: string;
  cliente_whatsapp?: string;
  message: string;
  templateId?: string;
  category?: string;
  status: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type responseHistorico = {
  data: Historico[];
  limit: number;
  page: number;
  total: number;
};

export interface IHistoricoContext {
  historico: Historico[] | [];
  setQuery: React.Dispatch<SetStateAction<string>>;
  setPage: React.Dispatch<SetStateAction<number>>;
  setLimit: React.Dispatch<SetStateAction<number>>;
  setOrder: React.Dispatch<SetStateAction<"DESC" | "ASC">>;
}
export type TemplateParameter = {
  type: "text" | "currency" | "date_time" | "image" | "document"
  text: string;
};

export type TemplateComponent = {
  type: "BODY" | "HEADER" | "FOOTER";
  parameters: TemplateParameter[];
};

export type TemplateRecipient = {
  name: string;
  number: string;
  components: TemplateComponent[];
};

export type SendTemplate = {
  templateId: string;
  account: number;
  to: TemplateRecipient[];
};
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
export type UploadButtonProps = {
  onUpload: (file: File, rows?: Record<string, string>[]) => void;
  disabled?: boolean;
};
