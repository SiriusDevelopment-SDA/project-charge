import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { CampaignService } from "../../services/campaign/campaign.service";
import { useAccountParam } from "../useAccountParam";

export function useCampaignsQuery() {
  const account = useAccountParam();

  return useQuery({
    queryKey: queryKeys.campaigns.all(account ?? ""),
    queryFn: () => CampaignService.list(account),
    refetchInterval: 60_000,
    enabled: Boolean(account),
  });
}

export function useCampaignMetricsQuery() {
  const account = useAccountParam();

  return useQuery({
    queryKey: queryKeys.campaigns.metrics(account ?? ""),
    queryFn: () => CampaignService.metrics(account),
    refetchInterval: 60_000,
    enabled: Boolean(account),
  });
}

export function useCategoriesQuery() {
  return useQuery({
    queryKey: queryKeys.campaigns.categories(),
    queryFn: () => CampaignService.listCategories(),
    staleTime: 1000 * 60 * 10,
  });
}
