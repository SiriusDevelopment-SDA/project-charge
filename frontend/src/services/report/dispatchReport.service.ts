import { Api } from "../api";
import type { DispatchBatchStatus, history, responseHistorico } from "../../types";

export type DispatchHistorySearchParams = {
  account: string;
  query: string;
  page: number;
  limit: number;
  sortorder: "ASC" | "DESC";
  /** `null` = histórico manual; `"campaigns"` = só campanhas. */
  scope: string | null;
  batchId: string | null;
};

export type DispatchHistoryPage = {
  data: responseHistorico["data"];
  total: number;
  page: number;
  limit: number;
};

export type LatestDispatchReportScope = "manual" | "campaigns" | null;

export type LatestDispatchReportResponse = {
  batch: DispatchBatchStatus | null;
  records: history[];
};

/**
 * Relatório de disparo: histórico, último lote e status de lote.
 *
 * Vive separado do `TemplateService` porque é outra responsabilidade — o
 * template é o cadastro, isto é o que aconteceu depois do envio. Compartilham
 * o prefixo `/templates` na API, não o motivo de mudar.
 */
export class DispatchReportService {
  static async searchHistory(
    params: DispatchHistorySearchParams,
  ): Promise<DispatchHistoryPage> {
    const { data } = await Api.post<responseHistorico>(
      "/templates/reports/search",
      {
        account: params.account,
        query: params.query,
        page: params.page,
        limit: params.limit,
        sortorder: params.sortorder,
        manualOnly: params.scope !== "campaigns",
        campaignOnly: params.scope === "campaigns",
        batchId: params.batchId || undefined,
      },
    );

    // A normalização fica aqui, e não no hook, para que qualquer consumidor
    // receba a mesma forma — a API pode omitir `data`/`total` e a tela nao tem
    // que saber disso.
    return {
      data: data.data ?? [],
      total: data.total ?? 0,
      page: data.page ?? params.page,
      limit: data.limit ?? params.limit,
    };
  }

  static async latestReport(params: {
    account: string | null;
    scope: LatestDispatchReportScope;
  }): Promise<LatestDispatchReportResponse> {
    const { data } = await Api.post<LatestDispatchReportResponse>(
      "/templates/batches/latest-report",
      {
        account: params.account,
        manualOnly: params.scope === "manual",
        campaignOnly: params.scope === "campaigns",
      },
    );
    return data;
  }

  static async batchStatus(batchId: string | null): Promise<DispatchBatchStatus> {
    const { data } = await Api.post<DispatchBatchStatus>(
      "/templates/batches/status",
      { batchId },
    );
    return data;
  }
}
