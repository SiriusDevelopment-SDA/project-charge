import { Api } from "../api";
import type { TemplateCreateRequest } from "../../types/templateApiTypes";

export class TemplateService {
  static async create(payload: TemplateCreateRequest) {
    const { data } = await Api.post("/templates/create", payload);
    return data;
  }

  static async remove(id: string): Promise<{ success?: boolean }> {
    const { data } = await Api.post("/templates/delete", { templateId: id });
    return data as { success?: boolean };
  }
}
