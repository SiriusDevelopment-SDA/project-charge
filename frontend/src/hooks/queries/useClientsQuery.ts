import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { queryKeys } from "../../lib/queryKeys";
import { ClientService } from "../../services/client/client.service";
import { useAccountParam } from "../useAccountParam";
import type { Service } from "../../types";

type ClientQueryParams = {
  query: string;
  page: number;
  limit: number;
  order: "DESC" | "ASC";
  groupServices: boolean;
};

export function useClientsQuery(params: ClientQueryParams) {
  const account = useAccountParam();

  return useQuery({
    queryKey: queryKeys.clients.list(account ?? "", params),
    queryFn: async () => {
      const response = await ClientService.searchClients({
        account,
        query: params.query,
        page: params.page,
        limit: params.limit,
        sortorder: params.order,
        relationService: params.groupServices,
      });

      const clients = response.data.data ?? [];

      if (params.query.trim() !== "" && clients.length === 0) {
        toast.warning(`Nenhum cliente encontrado para: ${params.query}`);
      }

      return clients;
    },
    enabled: Boolean(account),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
}

export function useServicesQuery(companyId: string | undefined) {
  return useQuery<Service[]>({
    queryKey: queryKeys.clients.services(companyId ?? ""),
    queryFn: () => ClientService.listServices(companyId!).then((r) => r.data),
    enabled: Boolean(companyId),
    staleTime: 1000 * 60 * 5,
  });
}
