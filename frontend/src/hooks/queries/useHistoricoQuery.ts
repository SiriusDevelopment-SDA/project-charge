import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { Api } from "../../services/api";
import type { responseHistorico } from "../../types";
import { useAccountParam } from "../useAccountParam";

type HistoryQueryParams = {
  query: string;
  page: number;
  limit: number;
  order: "DESC" | "ASC";
  scope: string | null;
  batchId: string | null;
};

export function useHistoricoQuery(params: HistoryQueryParams) {
  const account = useAccountParam();

  return useQuery({
    queryKey: queryKeys.history.list(account ?? "", params),
    queryFn: async () => {
      const response = await Api.post<responseHistorico>("/templates/reports/search", {
        account,
        query: params.query,
        page: params.page,
        limit: params.limit,
        sortorder: params.order,
        manualOnly: params.scope !== "campaigns",
        campaignOnly: params.scope === "campaigns",
        batchId: params.batchId || undefined,
      });
      const body = response.data;
      return {
        data: body.data ?? [],
        total: body.total ?? 0,
        page: body.page ?? params.page,
        limit: body.limit ?? params.limit,
      };
    },
    refetchInterval: 10_000,
    enabled: Boolean(account),
    placeholderData: keepPreviousData,
  });
}
