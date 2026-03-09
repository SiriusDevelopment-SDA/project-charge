import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Api } from "../../../services/api";
import type { IHistoricoContext, history, responseHistorico } from "../../../types";
import { getErrorMessage } from "../../../utils/error";

export function useHistoricoController(): IHistoricoContext {
  const [histories, setHistory] = useState<history[]>([]);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [order, setOrder] = useState<"DESC" | "ASC">("DESC");
  const [query, setQuery] = useState<string>("");

  useEffect(() => {
    const fetchHistorico = async () => {
      try {
        const account = new URLSearchParams(window.location.search).get("account");

        const response = await Api.post<responseHistorico>(
          "/templates/reports/search",
          {
            account,
            query,
            page,
            limit,
            sortorder: order,
          }
        );

        setHistory((prev) => {
          const map = new Map<string, history>();
          [...prev, ...response.data.data].forEach((item) => {
            map.set(item.id, item);
          });
          return Array.from(map.values());
        });
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Erro ao buscar o historico."));
      }
    };

    void fetchHistorico();
  }, [query, page, limit, order]);

  return {
    histories,
    setQuery,
    setPage,
    setLimit,
    setOrder,
  };
}
