import { Api } from "../api";
import type { TemplateCreateRequest } from "../../types/templateApiTypes";
import type { TemplateSearchResponse } from "../../types/templateApiTypes";

export class TemplateService {
  static async search(params: {
    account: number;
    query?: string;
    page?: number;
    limit?: number;
    sortorder?: "ASC" | "DESC";
  }): Promise<TemplateSearchResponse> {
    const { data } = await Api.post<TemplateSearchResponse>("/templates/search", {
      account: params.account,
      query: params.query ?? "",
      page: params.page ?? 1,
      limit: params.limit ?? 50,
      sortorder: params.sortorder ?? "DESC",
    });
    return data;
  }

  static async create(payload: TemplateCreateRequest) {
    const { data } = await Api.post("/templates/create", payload);
    return data;
  }

  static async remove(id: string): Promise<{ success?: boolean }> {
    const { data } = await Api.post("/templates/delete", { templateId: id });
    return data as { success?: boolean };
  }
}
