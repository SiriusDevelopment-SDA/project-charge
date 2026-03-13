import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Api } from "../../../services/api";
import type { DispatchBatchStatus, history } from "../../../types";
import { getErrorMessage } from "../../../utils/error";

type LatestDispatchReportResponse = {
  batch: DispatchBatchStatus | null;
  records: history[];
};

type LatestDispatchReportScope = "manual" | "campaigns" | null;

const LIVE_REPORT_POLL_INTERVAL_MS = 1000;

export function useLatestDispatchReportController(
  scope: LatestDispatchReportScope,
  account: string | null,
) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<LatestDispatchReportResponse | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const enabled = scope !== null;

  const fetchLatestReport = useCallback(
    async (showLoader = false, showErrorToast = true) => {
      if (!enabled) return;
      if (!account) {
        if (showErrorToast) {
          toast.warning("Conta nao identificada para consultar o ultimo disparo.");
        }
        return;
      }

      try {
        if (showLoader) {
          setIsLoading(true);
        }

        const response = await Api.post<LatestDispatchReportResponse>(
          "/templates/batches/latest-report",
          {
            account,
            manualOnly: scope === "manual",
            campaignOnly: scope === "campaigns",
          },
        );

        setReport(response.data);
        setLastUpdatedAt(new Date());
      } catch (error: unknown) {
        if (showErrorToast) {
          toast.error(getErrorMessage(error, "Erro ao carregar o ultimo disparo"));
        }
      } finally {
        if (showLoader) {
          setIsLoading(false);
        }
      }
    },
    [account, enabled, scope],
  );

  const openLatestReport = useCallback(async () => {
    setIsOpen(true);
    await fetchLatestReport(true);
  }, [fetchLatestReport]);

  const closeLatestReport = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (!isOpen || !enabled) return;

    const intervalId = window.setInterval(() => {
      void fetchLatestReport(false, false);
    }, LIVE_REPORT_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [enabled, fetchLatestReport, isOpen]);

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
    latestDispatchReport: report,
    latestDispatchProcessedRecipients: processedRecipients,
    latestDispatchTotalRecipients: totalRecipients,
    latestDispatchRemainingRecipients: remainingRecipients,
    latestDispatchStatusLabel: liveStatusLabel,
    latestDispatchLastUpdatedAt: lastUpdatedAt,
    openLatestReport,
    closeLatestReport,
  };
}
