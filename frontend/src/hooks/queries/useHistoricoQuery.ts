import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { DispatchReportService } from "../../services/report/dispatchReport.service";
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
    queryFn: () =>
      DispatchReportService.searchHistory({
        account,
        query: params.query,
        page: params.page,
        limit: params.limit,
        sortorder: params.order,
        scope: params.scope,
        batchId: params.batchId,
      }),
    refetchInterval: 30_000,
    enabled: Boolean(account),
    placeholderData: keepPreviousData,
  });
}
