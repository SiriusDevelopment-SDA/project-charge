import type { SetStateAction } from "react";
import type { Invoice, InvoicesResponse } from "./invoiceApiTypes";

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
    clients: Cliente[] | [];
    setQuery: React.Dispatch<SetStateAction<string>>
    setPage: React.Dispatch<SetStateAction<number>>;
    setLimit: React.Dispatch<SetStateAction<number>>;
    setOrder: React.Dispatch<SetStateAction<"DESC" | "ASC">>;
    setGroupInvoices: React.Dispatch<SetStateAction<boolean>>;
    fetchServices: (companyId?: string) => Promise<void>;
    servicos: Service[];
    // fetchInvoices: (client: Cliente[]) => void;
  }