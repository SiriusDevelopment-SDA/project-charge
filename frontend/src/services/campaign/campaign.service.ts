import { Api } from "../api";
import type { CampaignData, CampaignMetrics, Category, CollectionsMetrics } from "../../types";
import type { CampaignUpdate } from "../../types/champaignApiTypes";

type CampaignCreatePayload = {
  name: string;
  company: string;
  templateId: string;
  categoryId: string;
  startDate: string;
  endDate?: string;
  dispatchTime: string;
  timezone: string;
  recurring: boolean;
  clients: string[];
  templateMapVars: Record<string, unknown>[];
};

export class CampaignService {
  static async list(account: string | null): Promise<CampaignData[]> {
    const query = account ? `?account=${account}` : "";
    const { data } = await Api.get<CampaignData[]>(`/campaigns${query}`);
    return data;
  }

  static async createCampaignRequest(payload: CampaignCreatePayload) {
    return Api.post("/campaigns/create", payload);
  }

  static async update(campaignId: string, payload: CampaignUpdate) {
    return Api.patch(`/campaigns/${campaignId}`, payload);
  }

  static async listCategories(): Promise<Category[]> {
    const { data } = await Api.get<Category[]>("/categories");
    return data;
  }

  static async remove(id: string): Promise<{ success?: boolean }> {
    const { data } = await Api.delete(`/campaigns/${id}`);
    return data as { success?: boolean };
  }

  static async metrics(account: string | null): Promise<CampaignMetrics> {
    const query = account ? `?account=${account}` : "";
    const { data } = await Api.get<CampaignMetrics>(`/campaigns/metrics${query}`);
    return data;
  }

  static async collectionsMetrics(account: string | null): Promise<CollectionsMetrics> {
    const query = account ? `?account=${account}` : "";
    const { data } = await Api.get<CollectionsMetrics>(`/campaigns/collections/metrics${query}`);
    return data;
  }
}

