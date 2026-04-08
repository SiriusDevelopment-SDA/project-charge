import { Api } from "../api";
import type { CampaignData, CampaignMetrics, Category, CollectionsMetrics } from "../../types";
import type { CampaignUpdate, RecurringType } from "../../types/champaignApiTypes";

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
  recurringType?: RecurringType;
  recurringDays?: Array<number | string>;
  clients: string[];
  templateMapVars: Record<string, unknown>[];
  invoiceRule?: {
    operator: "greater_than" | "less_than" | "greater_or_equal" | "less_or_equal";
    daysFrom: number;
    daysTo: number;
  } | null;
};

type CampaignMetricsFilters = {
  search?: string;
  category?: string | null;
};

const DEFAULT_CAMPAIGN_METRICS: CampaignMetrics = {
  totalCampaigns: 0,
  activeCampaigns: 0,
  dispatchesToday: 0,
  totalDispatch: 0,
  totalDispatchSuccess: 0,
  totalDispatchToday: 0,
  totalDispatchSuccessToday: 0,
  totalDispatch24h: 0,
  totalDispatchSuccess24h: 0,
  deliveryRateTotal: 0,
  deliveryRateToday: 0,
  deliveryRate24h: 0,
  nextDispatchTime: null,
  nextDispatchLabel: "Sem disparos agendados",
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCampaignMetrics(data: unknown): CampaignMetrics {
  if (!data || typeof data !== "object") return DEFAULT_CAMPAIGN_METRICS;
  const payload = data as Partial<CampaignMetrics>;

  return {
    totalCampaigns: toNumber(payload.totalCampaigns),
    activeCampaigns: toNumber(payload.activeCampaigns),
    dispatchesToday: toNumber(payload.dispatchesToday),
    totalDispatch: toNumber(payload.totalDispatch),
    totalDispatchSuccess: toNumber(payload.totalDispatchSuccess),
    totalDispatchToday: toNumber(payload.totalDispatchToday),
    totalDispatchSuccessToday: toNumber(payload.totalDispatchSuccessToday),
    totalDispatch24h: toNumber(payload.totalDispatch24h),
    totalDispatchSuccess24h: toNumber(payload.totalDispatchSuccess24h),
    deliveryRateTotal: toNumber(payload.deliveryRateTotal),
    deliveryRateToday: toNumber(payload.deliveryRateToday),
    deliveryRate24h: toNumber(payload.deliveryRate24h),
    nextDispatchTime:
      typeof payload.nextDispatchTime === "string" ? payload.nextDispatchTime : null,
    nextDispatchLabel:
      typeof payload.nextDispatchLabel === "string" && payload.nextDispatchLabel.trim()
        ? payload.nextDispatchLabel
        : DEFAULT_CAMPAIGN_METRICS.nextDispatchLabel,
  };
}

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

  static async metrics(
    account: string | null,
    filters: CampaignMetricsFilters = {},
  ): Promise<CampaignMetrics> {
    const params = new URLSearchParams();
    if (account) params.set("account", account);
    if (filters.search?.trim()) params.set("search", filters.search.trim());
    if (filters.category?.trim()) params.set("category", filters.category.trim());
    const query = params.toString() ? `?${params.toString()}` : "";
    const { data } = await Api.get(`/campaigns/metrics${query}`);
    return normalizeCampaignMetrics(data);
  }

  static async getByClientIds(clientIds: string[]): Promise<Record<string, CampaignData[]>> {
    if (!clientIds.length) return {};
    const { data } = await Api.post<Record<string, CampaignData[]>>('/campaigns/by-clients', { clientIds });
    return data;
  }

  static async collectionsMetrics(account: string | null): Promise<CollectionsMetrics> {
    const query = account ? `?account=${account}` : "";
    const { data } = await Api.get<CollectionsMetrics>(`/campaigns/collections/metrics${query}`);
    return data;
  }
}

