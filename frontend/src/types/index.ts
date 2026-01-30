// IMPORT TYPE INPUTS

import type { Dispatch, ReactNode, SetStateAction } from "react";

export type MyInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;

};



export type PaginationProps = {
  className?: string;
  page: number;
  onPrev: () => void;
  onNext: () => void;
  disablePrev?: boolean;
  disableNext?: boolean;
};

export type Template = {
  id: string;
  name: string;
  message: string;
  category: string;
  active: boolean;
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
  invoices?: [];
  services?: [];
  company?: Record<string, string>;
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
  setSelectedClientes: React.Dispatch<SetStateAction<Cliente[]>>;
  selectedClientes: Cliente[];
  mapClienteVars: Record<string, string>;
  fetchInvoices: (client: Cliente) => void;
}
export interface ITemplatesContext {
  templates: Template[] | [];
  setQuery: React.Dispatch<SetStateAction<string>>;
  setPage: React.Dispatch<SetStateAction<number>>;
  setLimit: React.Dispatch<SetStateAction<number>>;
  setOrder: React.Dispatch<SetStateAction<"DESC" | "ASC">>;
  page: number;
}
export type FilterButtonProps = {
  templates: Template[];
  selectedCategory?: string
  setSelectedCategory: React.Dispatch<SetStateAction<string>>
  onCategoryChange?: (categoria: string) => void;
};