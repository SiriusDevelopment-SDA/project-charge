import { useCallback, useState } from "react";
import { useClientsQuery, useServicesQuery } from "./queries/useClientsQuery";
import { useFetchInvoicesMutation } from "./mutations/useClientsMutations";
import { useDebounce } from "./useDebounce";
import type { Cliente, IClientsContext } from "../types";

export function useClient(): IClientsContext {
  const [query, setQueryState] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [order, setOrder] = useState<"DESC" | "ASC">("DESC");
  const [groupServices, setGroupServices] = useState(false);
  const [groupInvoices, setGroupInvoices] = useState(false);
  const [servicesCompanyId, setServicesCompanyId] = useState<string | undefined>(undefined);

  const debouncedQuery = useDebounce(query, 350);

  const { data: clients = [] } = useClientsQuery({
    query: debouncedQuery,
    page,
    limit,
    order,
    groupServices,
    groupInvoices,
  });

  const { data: services = [] } = useServicesQuery(servicesCompanyId);

  const fetchInvoicesMutation = useFetchInvoicesMutation();

  const setQuery = useCallback((value: string) => {
    setQueryState(value);
    setPage(1);
  }, []);

  const fetchInvoices = useCallback(
    async (targetClients: Cliente[]): Promise<Cliente[]> => {
      try {
        const { updatedClients } = await fetchInvoicesMutation.mutateAsync(targetClients);
        return updatedClients;
      } catch {
        return targetClients;
      }
    },
    [fetchInvoicesMutation],
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
    setGroupInvoices,
    setGroupServices,
    fetchInvoices,
    fetchServices,
  };
}
