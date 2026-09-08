import { Api } from "../api";
import type {
  TemplateCreateRequest,
  TemplateRecipient,
  TemplateSearchResponse,
} from "../../types/templateApiTypes";
import type { TemplateUsageMetric } from "../../types";

export type TemplateDispatchRequest = {
  templateId: string;
  account: string;
  /** null/ausente => o backend usa o primeiro canal da empresa como fallback. */
  channelId: string | null;
  to: TemplateRecipient[];
};

export type TemplateDispatchResponse = {
  batchId: string;
  queued: number;
  skipped: number;
  skippedInvalidInvoices?: number;
};

export class TemplateService {
  static async search(params: {
    // `string` e o que o app tem em maos (`useAccountParam`). O backend
    // converte com `@Type(() => Number)` no DTO, entao nao ha ganho em
    // aceitar os dois tipos aqui — so a inconsistencia sobrevivendo.
    account: string;
    query?: string;
    page?: number;
    limit?: number;
    sortorder?: "ASC" | "DESC";
  }): Promise<TemplateSearchResponse> {
    const { data } = await Api.post<TemplateSearchResponse>("/templates/search", {
      account: params.account,
      query: params.query ?? "",
      page: params.page ?? 1,
      limit: params.limit ?? 50,
      sortorder: params.sortorder ?? "DESC",
    });
    return data;
  }

  static async create(payload: TemplateCreateRequest) {
    const { data } = await Api.post("/templates/create", payload);
    return data;
  }

  static async remove(id: string): Promise<{ success?: boolean }> {
    const { data } = await Api.post("/templates/delete", { templateId: id });
    return data as { success?: boolean };
  }

  static async usage(account: string): Promise<TemplateUsageMetric[]> {
    const { data } = await Api.post<TemplateUsageMetric[]>("/templates/usage", {
      account,
    });
    return data;
  }

  /**
   * Enfileira o disparo. O corpo vai como o hook monta — inclusive
   * `components: []`, que e o sinal de "monte no servidor" combinado no PR #101.
   */
  static async send(
    payload: TemplateDispatchRequest,
  ): Promise<TemplateDispatchResponse> {
    const { data } = await Api.post<TemplateDispatchResponse>(
      "/templates/send",
      payload,
    );
    return data;
  }
}
