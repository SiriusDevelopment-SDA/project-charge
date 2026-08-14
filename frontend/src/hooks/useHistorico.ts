import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useHistoricoQuery } from "./queries/useHistoricoQuery";
import type { IHistoricoContext } from "../types";

const SEARCH_DEBOUNCE_MS = 400;

export function useHistorico(): IHistoricoContext {
  const [query, setQueryState] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [order, setOrder] = useState<"DESC" | "ASC">("DESC");

  // Busca global com debounce: o valor digitado vira `query` (enviada ao
  // backend, que filtra name/number com ILIKE no conjunto INTEIRO) só depois
  // de uma pausa na digitação, evitando uma requisição por tecla.
  const searchDebounceRef = useRef<number | undefined>(undefined);
  const setQuery = useCallback((value: string) => {
    window.clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = window.setTimeout(() => {
      setQueryState(value.trim());
    }, SEARCH_DEBOUNCE_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(searchDebounceRef.current), []);

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
