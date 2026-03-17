import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useLatestDispatchReportQuery,
} from "../../queries/useLatestDispatchReportQuery";
import { queryKeys } from "../../../lib/queryKeys";

type LatestDispatchReportScope = "manual" | "campaigns" | null;

export function useLatestDispatchReportController(
  scope: LatestDispatchReportScope,
  account: string | null,
) {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  const {
    data: report,
    isLoading,
    dataUpdatedAt,
  } = useLatestDispatchReportQuery(scope, account, isOpen);

  const lastUpdatedAt = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  const openLatestReport = useCallback(async () => {
    setIsOpen(true);
    await queryClient.invalidateQueries({
      queryKey: queryKeys.history.latestReport(account ?? "", scope ?? ""),
    });
  }, [queryClient, account, scope]);

  const closeLatestReport = useCallback(() => {
    setIsOpen(false);
  }, []);

  const processedRecipients = report?.batch?.processedRecipients ?? 0;
  const totalRecipients = report?.batch?.totalRecipients ?? 0;
  const remainingRecipients = Math.max(totalRecipients - processedRecipients, 0);

  const liveStatusLabel = useMemo(() => {
    if (!report?.batch) return "Sem lote recente";
    if (report.batch.status === "queued") return "Na fila";
    if (report.batch.status === "processing") return "Em andamento";
    if (report.batch.status === "completed") return "Concluido";
    if (report.batch.status === "partial") return "Concluido com falhas";
    if (report.batch.status === "failed") return "Falhou";
    return "Lote";
  }, [report?.batch]);

  return {
    latestDispatchReportScope: scope,
    isLatestReportOpen: isOpen,
    isLatestReportLoading: isLoading,
    latestDispatchReport: report ?? null,
    latestDispatchProcessedRecipients: processedRecipients,
    latestDispatchTotalRecipients: totalRecipients,
    latestDispatchRemainingRecipients: remainingRecipients,
    latestDispatchStatusLabel: liveStatusLabel,
    latestDispatchLastUpdatedAt: lastUpdatedAt,
    openLatestReport,
    closeLatestReport,
  };
}
