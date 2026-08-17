import { useCallback, useEffect, useRef, useState } from "react";
import {
  useActivityLogQuery,
  type ActivityCategory,
} from "./queries/useActivityLogQuery";

const SEARCH_DEBOUNCE_MS = 400;

/**
 * Estado da tela de Histórico geral: paginação no servidor, filtro por
 * categoria(s) e busca global com debounce (por autor/ação/alvo). Espelha o
 * padrão do histórico de disparos.
 */
export function useActivityLog() {
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [query, setQueryState] = useState("");
  const [categories, setCategoriesState] = useState<ActivityCategory[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Qualquer mudança de filtro volta para a página 1.
  useEffect(() => {
    setPage(1);
  }, [query, categories, dateFrom, dateTo]);

  const searchDebounceRef = useRef<number | undefined>(undefined);
  const setQuery = useCallback((value: string) => {
    window.clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = window.setTimeout(() => {
      setQueryState(value.trim());
    }, SEARCH_DEBOUNCE_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(searchDebounceRef.current), []);

  const toggleCategory = useCallback((category: ActivityCategory) => {
    setCategoriesState((previous) =>
      previous.includes(category)
        ? previous.filter((c) => c !== category)
        : [...previous, category],
    );
  }, []);

  const clearCategories = useCallback(() => setCategoriesState([]), []);

  const { data } = useActivityLogQuery({
    page,
    limit,
    sortorder: "DESC",
    query,
    categories,
    dateFrom,
    dateTo,
  });

  return {
    rows: data?.data ?? [],
    total: data?.total ?? 0,
    page,
    limit,
    categories,
    dateFrom,
    dateTo,
    setPage,
    setQuery,
    toggleCategory,
    clearCategories,
    setDateFrom,
    setDateTo,
  };
}
