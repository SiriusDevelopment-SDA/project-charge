import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { CampaignService } from "../../services/campaign/campaign.service";
import { useAccountParam } from "../useAccountParam";

type CampaignMetricsFilters = {
  search?: string;
  category?: string | null;
};

export function useCampaignsQuery() {
  const account = useAccountParam();

  return useQuery({
    queryKey: queryKeys.campaigns.all(account ?? ""),
    queryFn: () => CampaignService.list(account),
    refetchInterval: 60_000,
    enabled: Boolean(account),
  });
}

export function useCampaignMetricsQuery(filters: CampaignMetricsFilters = {}) {
  const account = useAccountParam();
  const normalizedFilters = {
    search: filters.search?.trim() || undefined,
    category: filters.category?.trim() || undefined,
  };

  return useQuery({
    queryKey: queryKeys.campaigns.metrics(account ?? "", normalizedFilters),
    queryFn: () => CampaignService.metrics(account, normalizedFilters),
    refetchInterval: 60_000,
    enabled: Boolean(account),
    placeholderData: (previousData) => previousData,
  });
}

export function useCategoriesQuery() {
  return useQuery({
    queryKey: queryKeys.campaigns.categories(),
    queryFn: () => CampaignService.listCategories(),
    staleTime: 1000 * 60 * 10,
  });
}
