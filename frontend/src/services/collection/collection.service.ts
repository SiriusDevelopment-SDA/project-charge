import { Api } from "../api";
import type {
  PaymentPromise,
  CreatePaymentPromisePayload,
  PaymentPromiseStatus,
  ClientInteraction,
  CreateClientInteractionPayload,
  DispatchSummary,
  DispatchSummaryBatchResponse,
} from "../../types";

export class CollectionService {
  // Payment Promise
  static async getPromisesByClient(clientId: string): Promise<PaymentPromise[]> {
    return Api.get<PaymentPromise[]>(`/payment-promise/client/${clientId}`).then((r) => r.data);
  }

  static async getPromisesByCompany(companyId: string): Promise<PaymentPromise[]> {
    return Api.get<PaymentPromise[]>(`/payment-promise/company/${companyId}`).then((r) => r.data);
  }

  static async getLatestPromise(clientId: string): Promise<PaymentPromise | null> {
    return Api.get<PaymentPromise | null>(`/payment-promise/client/${clientId}/latest`)
      .then((r) => r.data)
      .catch(() => null);
  }

  /** Busca a promessa mais recente de cada cliente em uma única requisição. */
  static async getLatestPromiseBatch(clientIds: string[]): Promise<PaymentPromise[]> {
    if (!clientIds.length) return [];
    return Api.post<PaymentPromise[]>("/payment-promise/latest-batch", { clientIds }).then((r) => r.data);
  }

  static async createPromise(payload: CreatePaymentPromisePayload): Promise<PaymentPromise> {
    return Api.post<PaymentPromise>("/payment-promise", payload).then((r) => r.data);
  }

  static async updatePromiseStatus(id: string, status: PaymentPromiseStatus): Promise<PaymentPromise> {
    return Api.patch<PaymentPromise>(`/payment-promise/${id}/status`, { status }).then((r) => r.data);
  }

  // Client Interaction
  static async getInteractionsByClient(clientId: string): Promise<ClientInteraction[]> {
    return Api.get<ClientInteraction[]>(`/client-interaction/client/${clientId}`).then((r) => r.data);
  }

  static async createInteraction(payload: CreateClientInteractionPayload): Promise<ClientInteraction> {
    return Api.post<ClientInteraction>("/client-interaction", payload).then((r) => r.data);
  }

  // Dispatch summary
  static async getDispatchSummary(phone: string, company_id: string): Promise<DispatchSummary> {
    return Api.get<DispatchSummary>("/client-interaction/dispatches/summary", {
      params: { phone, company_id },
    }).then((r) => r.data);
  }

  /** Busca dispatch summary de múltiplos telefones em uma única requisição. */
  static async getDispatchSummaryBatch(
    phones: string[],
    company_id: string,
  ): Promise<DispatchSummaryBatchResponse> {
    if (!phones.length) return {};
    return Api.post<DispatchSummaryBatchResponse>("/client-interaction/dispatches/summary-batch", {
      phones,
      company_id,
    }).then((r) => r.data);
  }
}
