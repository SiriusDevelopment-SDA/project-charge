import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useLocation } from "react-router-dom";
import { Api } from "../../../services/api";
import type { IHistoricoContext, history, responseHistorico } from "../../../types";
import { getErrorMessage } from "../../../utils/error";

const HISTORY_REFRESH_INTERVAL_MS = 10000;

export function useHistoricoController(): IHistoricoContext {
  const [histories, setHistory] = useState<history[]>([]);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [order, setOrder] = useState<"DESC" | "ASC">("DESC");
  const [query, setQuery] = useState<string>("");
  const location = useLocation();

  const fetchHistorico = useCallback(
    async (showErrorToast = true) => {
      try {
        const searchParams = new URLSearchParams(location.search);
        const account = searchParams.get("account");
        const scope = searchParams.get("scope");
        const batchId = searchParams.get("batchId");
        if (!account) return;

        const response = await Api.post<responseHistorico>(
          "/templates/reports/search",
          {
            account,
            query,
            page,
            limit,
            sortorder: order,
            manualOnly: scope !== "campaigns",
            campaignOnly: scope === "campaigns",
            batchId: batchId || undefined,
          }
        );

        setHistory(response.data.data ?? []);
      } catch (error: unknown) {
        if (showErrorToast) {
          toast.error(getErrorMessage(error, "Erro ao buscar o historico."));
        }
      }
    },
    [limit, location.search, order, page, query]
  );

  useEffect(() => {
    void fetchHistorico();
  }, [fetchHistorico]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void fetchHistorico(false);
    }, HISTORY_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [fetchHistorico]);

  return {
    histories,
    setQuery,
    setPage,
    setLimit,
    setOrder,
  };
}
