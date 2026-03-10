
import type { InvoicesResponse } from "./invoiceApiTypes";

type company = {
    id: string;
    name: string;
    account: string
  }

export type Service = {
  id: string;
  id_servico: string;
  status: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  // client and company omitted for simplicity
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
    invoices?: InvoicesResponse;
    services?: Service[];
    company?: company;
  }
  export type responseClients = {
    data: Cliente[];
    limit: number;
    page: number;
    total: number;
  }
  export interface IClientsContext {
    clients: Cliente[];
    services: Service[];
  
    setQuery: (value: string) => void;
    setPage: (value: number) => void;
    setLimit: (value: number) => void;
    setOrder: (value: "DESC" | "ASC") => void;
    setGroupInvoices: (value: boolean) => void;
    setGroupServices: (value: boolean) => void;
  
    fetchInvoices: (clients: Cliente[]) => Promise<Cliente[]>;
    fetchServices: (companyId?: string) => Promise<void>;
  }
