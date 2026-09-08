import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { DispatchReportService } from "../../services/report/dispatchReport.service";
import type { LatestDispatchReportScope } from "../../services/report/dispatchReport.service";
import type { DispatchBatchStatus } from "../../types";

export type { LatestDispatchReportResponse } from "../../services/report/dispatchReport.service";

export function useLatestDispatchReportQuery(
  scope: LatestDispatchReportScope,
  account: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.history.latestReport(account ?? "", scope ?? ""),
    queryFn: () => DispatchReportService.latestReport({ account, scope }),
    refetchInterval: enabled ? 1_000 : false,
    enabled: enabled && Boolean(account) && scope !== null,
  });
}

const TERMINAL_STATUSES = new Set(["completed", "partial", "failed"]);

export function useBatchStatusQuery(account: string | null, batchId: string | null) {
  return useQuery<DispatchBatchStatus>({
    queryKey: ["batch-status", batchId],
    queryFn: () => DispatchReportService.batchStatus(batchId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && TERMINAL_STATUSES.has(status) ? false : 1_000;
    },
    enabled: Boolean(account) && Boolean(batchId),
  });
}
