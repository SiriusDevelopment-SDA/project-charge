import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useHistoricoQuery } from "./queries/useHistoricoQuery";
import type { IHistoricoContext } from "../types";

export function useHistorico(): IHistoricoContext {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [order, setOrder] = useState<"DESC" | "ASC">("DESC");

  const { search } = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const scope = searchParams.get("scope");
  const batchId = searchParams.get("batchId");

  // Reset to page 1 whenever the filter context changes
  useEffect(() => {
    setPage(1);
  }, [scope, batchId, query]);

  const { data } = useHistoricoQuery({
    query,
    page,
    limit,
    order,
    scope,
    batchId,
  });

  const histories = data?.data ?? [];
  const total = data?.total ?? 0;

  return { histories, total, page, limit, setQuery, setPage, setLimit, setOrder };
}
