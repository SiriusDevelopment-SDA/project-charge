import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useHistoricoQuery } from "./queries/useHistoricoQuery";
import type { IHistoricoContext } from "../types";

export function useHistorico(): IHistoricoContext {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [order, setOrder] = useState<"DESC" | "ASC">("DESC");

  const { search } = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const scope = searchParams.get("scope");
  const batchId = searchParams.get("batchId");

  const { data: histories = [] } = useHistoricoQuery({
    query,
    page,
    limit,
    order,
    scope,
    batchId,
  });

  return { histories, setQuery, setPage, setLimit, setOrder };
}
