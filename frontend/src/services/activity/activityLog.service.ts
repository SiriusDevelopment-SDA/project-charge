import { Api } from "../api";

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

export type ActivityLogSearchParams = {
  page: number;
  limit: number;
  sortorder: "ASC" | "DESC";
  query: string;
  categories: ActivityCategory[];
  dateFrom: string;
  dateTo: string;
};

export type ActivityLogPage = {
  data: ActivityLogRow[];
  total: number;
  page: number;
  limit: number;
};

export class ActivityLogService {
  static async search(
    params: ActivityLogSearchParams,
  ): Promise<ActivityLogPage> {
    // Campo vazio some do corpo: o backend trata ausente como "sem filtro", e
    // string vazia como filtro por vazio.
    const { data } = await Api.post<ActivityLogPage>("/activity-log/search", {
      page: params.page,
      limit: params.limit,
      sortorder: params.sortorder,
      query: params.query || undefined,
      categories: params.categories.length ? params.categories : undefined,
      dateFrom: params.dateFrom || undefined,
      dateTo: params.dateTo || undefined,
    });

    return {
      data: data.data ?? [],
      total: data.total ?? 0,
      page: data.page ?? params.page,
      limit: data.limit ?? params.limit,
    };
  }
}
