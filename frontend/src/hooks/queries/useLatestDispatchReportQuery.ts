import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { Api } from "../../services/api";
import type { DispatchBatchStatus, history } from "../../types";

type LatestDispatchReportScope = "manual" | "campaigns" | null;

export type LatestDispatchReportResponse = {
  batch: DispatchBatchStatus | null;
  records: history[];
};

export function useLatestDispatchReportQuery(
  scope: LatestDispatchReportScope,
  account: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.history.latestReport(account ?? "", scope ?? ""),
    queryFn: () =>
      Api.post<LatestDispatchReportResponse>("/templates/batches/latest-report", {
        account,
        manualOnly: scope === "manual",
        campaignOnly: scope === "campaigns",
      }).then((r) => r.data),
    refetchInterval: enabled ? 1_000 : false,
    enabled: enabled && Boolean(account) && scope !== null,
  });
}

const TERMINAL_STATUSES = new Set(["completed", "partial", "failed"]);

export function useBatchStatusQuery(account: string | null, batchId: string | null) {
  return useQuery<DispatchBatchStatus>({
    queryKey: ["batch-status", batchId],
    queryFn: () =>
      Api.post<DispatchBatchStatus>("/templates/batches/status", { batchId }).then(
        (r) => r.data,
      ),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && TERMINAL_STATUSES.has(status) ? false : 1_000;
    },
    enabled: Boolean(account) && Boolean(batchId),
  });
}
