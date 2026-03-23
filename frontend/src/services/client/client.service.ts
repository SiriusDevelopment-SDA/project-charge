import { Api } from "../api";
import type {
  InvoiceRuleFilter,
  InvoiceBatchResponse,
  responseClients,
  Service,
} from "../../types";

type SearchInvoicesPayload =
  | string[]
  | {
      documents?: string[];
      companyId?: string;
      filter?: InvoiceRuleFilter;
    };

export class ClientService {
  static async searchClients(params: {
    account: string | null;
    query: string;
    page: number;
    limit: number;
    sortorder: "DESC" | "ASC";
    relationService: boolean;
  }) {
    return Api.post<responseClients>("/clients/search", params);
  }

  static async searchInvoices(payload: SearchInvoicesPayload) {
    const request = Array.isArray(payload)
      ? {
          documents: payload.map((cnpj_cpf) => ({ cnpj_cpf })),
        }
      : {
          documents: (payload.documents ?? []).map((cnpj_cpf) => ({ cnpj_cpf })),
          companyId: payload.companyId,
          filter: payload.filter,
        };

    console.log("[ClientService.searchInvoices] payload enviado ao backend", {
      endpoint: "/invoices/search",
      body: request,
    });

    return Api.post<InvoiceBatchResponse>("/invoices/search", {
      ...request,
    });
  }

  static async listServices(companyId: string) {
    return Api.post<Service[]>("/services", { companyId });
  }
}
