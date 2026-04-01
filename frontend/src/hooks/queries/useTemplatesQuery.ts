import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { Api } from "../../services/api";
import type { TemplateSearchResponse, TemplateUsageMetric } from "../../types";
import { useAccountParam } from "../useAccountParam";

type TemplateQueryParams = {
  query: string;
  page: number;
  limit: number;
  order: "DESC" | "ASC";
};

export function useTemplatesQuery(params: TemplateQueryParams) {
  const account = useAccountParam();

  return useQuery({
    queryKey: queryKeys.templates.list(account ?? "", params),
    queryFn: async () => {
      const response = await Api.post<TemplateSearchResponse>("/templates/search", {
        account,
        query: params.query,
        page: params.page,
        limit: params.limit,
        sortorder: params.order,
      });
      return response.data.data.filter((item) => item.isEnabled);
    },
    enabled: Boolean(account),
    staleTime: 1000 * 60,
    refetchInterval: 1000 * 60,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
  });
}

export function useTemplateUsageQuery() {
  const account = useAccountParam();

  return useQuery({
    queryKey: queryKeys.templates.usage(account ?? ""),
    queryFn: async () => {
      const response = await Api.post<TemplateUsageMetric[]>("/templates/usage", {
        account,
      });
      return response.data;
    },
    enabled: Boolean(account),
    staleTime: 1000 * 60 * 5,
  });
}
