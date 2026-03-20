import { useCallback, useState } from "react";
import { useClientsQuery, useServicesQuery } from "./queries/useClientsQuery";
import { useFetchInvoicesMutation } from "./mutations/useClientsMutations";
import { useDebounce } from "./useDebounce";
import type { Cliente, IClientsContext } from "../types";
import { useGlobalLoading } from "./useGlobalLoading";

export function useClient(): IClientsContext {
  const [query, setQueryState] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [order, setOrder] = useState<"DESC" | "ASC">("DESC");
  const [groupServices, setGroupServices] = useState(false);
  const [servicesCompanyId, setServicesCompanyId] = useState<string | undefined>(undefined);

  const debouncedQuery = useDebounce(query, 350);

  const { data: clients = [] } = useClientsQuery({
    query: debouncedQuery,
    page,
    limit,
    order,
    groupServices,
  });

  const { data: services = [] } = useServicesQuery(servicesCompanyId);

  const fetchInvoicesMutation = useFetchInvoicesMutation();
  const { showLoading, hideLoading } = useGlobalLoading();

  const setQuery = useCallback((value: string) => {
    setQueryState(value);
    setPage(1);
  }, []);

  const fetchInvoices = useCallback(
    async (targetClients: Cliente[]): Promise<Cliente[]> => {
      if (!targetClients.length) {
        return [];
      }

      const loadingId = showLoading(
        targetClients.length === 1
          ? `Buscando faturas de ${targetClients[0]?.name ?? "cliente"}...`
          : "Buscando faturas dos clientes selecionados...",
      );

      try {
        const { updatedClients } = await fetchInvoicesMutation.mutateAsync(targetClients);
        return updatedClients;
      } catch {
        return targetClients;
      } finally {
        hideLoading(loadingId);
      }
    },
    [fetchInvoicesMutation, hideLoading, showLoading],
  );

  const fetchServices = useCallback(
    async (companyId?: string) => {
      const id = companyId ?? clients[0]?.company?.id;
      if (!id) return;
      setServicesCompanyId(id);
    },
    [clients],
  );

  return {
    clients,
    services,
    setQuery,
    setPage,
    setLimit,
    setOrder,
    setGroupInvoices: () => {},
    setGroupServices,
    fetchInvoices,
    fetchServices,
  };
}
