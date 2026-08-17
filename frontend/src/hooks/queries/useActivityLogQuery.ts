import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Api } from "../../services/api";

export type ActivityCategory =
  | "create"
  | "edit"
  | "delete"
  | "execute"
  | "auth"
  | "other";

export type ActivityLogRow = {
  id: string;
  agentEmail?: string | null;
  agentName?: string | null;
  category: ActivityCategory;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  createdAt: string;
};

type ActivityLogResponse = {
  page: number;
  limit: number;
  total: number;
  data: ActivityLogRow[];
};

export type ActivityLogQueryParams = {
  page: number;
  limit: number;
  sortorder: "ASC" | "DESC";
  query: string;
  categories: ActivityCategory[];
  dateFrom: string;
  dateTo: string;
};

export function useActivityLogQuery(params: ActivityLogQueryParams) {
  return useQuery({
    queryKey: ["activity-log", params],
    queryFn: async () => {
      const { data } = await Api.post<ActivityLogResponse>(
        "/activity-log/search",
        {
          page: params.page,
          limit: params.limit,
          sortorder: params.sortorder,
          query: params.query || undefined,
          categories: params.categories.length ? params.categories : undefined,
          dateFrom: params.dateFrom || undefined,
          dateTo: params.dateTo || undefined,
        },
      );
      return {
        data: data.data ?? [],
        total: data.total ?? 0,
        page: data.page ?? params.page,
        limit: data.limit ?? params.limit,
      };
    },
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}
