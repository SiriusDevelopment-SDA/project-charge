import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { Api } from "../../services/api";
import type { TemplateSearchResponse } from "../../types";
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
    staleTime: 1000 * 60 * 2,
    placeholderData: keepPreviousData,
  });
}
