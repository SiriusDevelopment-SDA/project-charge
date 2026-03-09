import { Api } from "../api";
import type {
  InvoiceBatchResponse,
  responseClients,
  Service,
} from "../../types";

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

  static async searchInvoices(documents: string[]) {
    return Api.post<InvoiceBatchResponse>("/invoices/search", {
      documents: documents.map((cnpj_cpf) => ({ cnpj_cpf })),
    });
  }

  static async listServices(companyId: string) {
    return Api.post<Service[]>("/services", { companyId });
  }
}
