// IMPORT TYPE INPUTS

import type { Dispatch, ReactNode, SetStateAction } from "react";
import type React from "react";

export type MyInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?:string;

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
  variables: {};
};

export type propTemplate = {
  setOpenState: React.Dispatch<React.SetStateAction<boolean>>;
  open: boolean;
  FilterButtonProp: true | false;
  templates: Template[]
  setTemplateSelecionado: React.Dispatch<React.SetStateAction<Template>> | {};
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
  company?: {};
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
}
export interface ITemplatesContext {
  templates: Template[] | [];
  setQuery: React.Dispatch<SetStateAction<string>>
}
export type FilterButtonProps = {
  templates: Template[];
  selectedCategory?: string
  setSelectedCategory: React.Dispatch<SetStateAction<string>>
  onCategoryChange?: (categoria: string) => void;
};