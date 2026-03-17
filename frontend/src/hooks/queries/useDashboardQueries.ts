import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { CampaignService } from "../../services/campaign/campaign.service";
import { DashboardService } from "../../services/dashboard/dashboard.service";
import { AuthService } from "../../services/auth/auth.service";
import { useAccountParam } from "../useAccountParam";
import type { CollectionsMetrics } from "../../types";

const initialCollectionsMetrics: CollectionsMetrics = {
  chargedCustomers30d: 0,
  respondedAfterCharge30d: 0,
  responseRate30d: 0,
  openFollowups: 0,
  noResponseOver24h: 0,
  lastResponseAt: null,
};

export { initialCollectionsMetrics };

export function useCollectionsMetricsQuery() {
  const account = useAccountParam();

  return useQuery({
    queryKey: queryKeys.campaigns.collectionsMetrics(account ?? ""),
    queryFn: () => CampaignService.collectionsMetrics(account),
    staleTime: 1000 * 60 * 5,
    enabled: Boolean(account),
  });
}

function useMeQuery() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => AuthService.me(),
    staleTime: 1000 * 60 * 10,
  });
}

export function useDashboardChargesQuery() {
  const { data: me } = useMeQuery();
  const companyId = me?.company?.id;

  return useQuery({
    queryKey: queryKeys.dashboard.charges(companyId ?? ""),
    queryFn: () => DashboardService.getCharges(companyId!),
    enabled: Boolean(companyId),
    staleTime: 1000 * 60 * 5,
  });
}
