import { useCallback, useState } from "react";
import { useClientsQuery, useServicesQuery } from "./queries/useClientsQuery";
import { useFetchInvoicesMutation } from "./mutations/useClientsMutations";
import { toast } from "react-toastify";
import { useDebounce } from "./useDebounce";
import type {
  Cliente,
  IClientsContext,
  InvoiceRuleClientsByDate,
  InvoiceRuleFilter,
} from "../types";
import { useGlobalLoading } from "./useGlobalLoading";
import { ClientService } from "../services/client/client.service";
import { getErrorMessage } from "../utils/error";

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

  const consultClientsByInvoiceRule = useCallback(
    async ({
      companyId,
      filter,
    }: {
      companyId: string;
      filter: InvoiceRuleFilter;
    }) => {
      if (!companyId) {
        return { clients: [], clientsByDispatchDate: {} };
      }

      const loadingId = showLoading("Consultando clientes pela regua de cobranca...");

      try {
        const response = await ClientService.searchInvoices({
          companyId,
          filter,
        });

        const { data: providers, errors, status, message } = response.data;

        if (status === "success") toast.success(message);
        if (status === "partial") toast.warning(message);
        if (status === "error") toast.error(message);

        errors?.forEach((error) => {
          toast.warning(`Cliente do documento: ${error.document} ${error.reason}`);
        });

        const clientsByDispatchDate: InvoiceRuleClientsByDate = {};
        const uniqueClients = new Map<string, Cliente>();
        const clientsByDateAndId = new Map<string, Cliente>();

        providers.forEach((provider) => {
          const mappedClient = {
            id: provider.clientData.id,
            clientId: provider.clientData.clientId,
            cnpj_cpf: provider.clientData.cnpj_cpf,
            name: provider.clientData.name,
            whatsapp: provider.clientData.whatsapp,
            email: provider.clientData.email ?? undefined,
            company: provider.clientData.company,
            invoices: provider.invoices,
          };

          const dispatchDate = provider.dispatchDate ?? filter.referenceDate;
          if (dispatchDate) {
            const scopedKey = `${dispatchDate}:${mappedClient.id}`;
            clientsByDateAndId.set(scopedKey, mappedClient);
          }

          uniqueClients.set(mappedClient.id, mappedClient);
        });

        clientsByDateAndId.forEach((client, scopedKey) => {
          const [dispatchDate] = scopedKey.split(":");
          const current = clientsByDispatchDate[dispatchDate] ?? [];
          current.push(client);
          clientsByDispatchDate[dispatchDate] = current;
        });

        return {
          clients: [...uniqueClients.values()],
          clientsByDispatchDate,
        };
      } catch (error) {
        toast.error(getErrorMessage(error, "Erro ao consultar clientes pela regua."));
        return { clients: [], clientsByDispatchDate: {} };
      } finally {
        hideLoading(loadingId);
      }
    },
    [hideLoading, showLoading],
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
    consultClientsByInvoiceRule,
    fetchServices,
  };
}
