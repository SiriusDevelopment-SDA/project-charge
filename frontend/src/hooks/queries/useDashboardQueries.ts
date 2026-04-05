import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { CampaignService } from "../../services/campaign/campaign.service";
import { DashboardService } from "../../services/dashboard/dashboard.service";
import { AuthService } from "../../services/auth/auth.service";
import { useAccountParam } from "../useAccountParam";
import type { CollectionsMetrics } from "../../types";

const REFETCH_INTERVAL = 30_000; // 30s – sincroniza com TTL do Redis no backend

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
    staleTime: 1000 * 25,
    refetchInterval: REFETCH_INTERVAL,
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
    staleTime: 1000 * 25,
    refetchInterval: REFETCH_INTERVAL,
    placeholderData: (prev) => prev,
  });
}

export function useDashboardReturnRateQuery() {
  const { data: me } = useMeQuery();
  const companyId = me?.company?.id;

  return useQuery({
    queryKey: queryKeys.dashboard.returnRate(companyId ?? ""),
    queryFn: () => DashboardService.getMonthlyReturnRate(companyId!),
    enabled: Boolean(companyId),
    staleTime: 1000 * 25,
    refetchInterval: REFETCH_INTERVAL,
    placeholderData: (prev) => prev,
  });
}

export function useDashboardCampaignsStatsQuery() {
  const { data: me } = useMeQuery();
  const companyId = me?.company?.id;

  return useQuery({
    queryKey: queryKeys.dashboard.campaigns(companyId ?? ""),
    queryFn: () => DashboardService.getCampaignsStats(companyId!),
    enabled: Boolean(companyId),
    staleTime: 1000 * 25,
    refetchInterval: REFETCH_INTERVAL,
    placeholderData: (prev) => prev,
  });
}

export function useDashboardPromisesQuery() {
  const { data: me } = useMeQuery();
  const companyId = me?.company?.id;

  return useQuery({
    queryKey: queryKeys.dashboard.promises(companyId ?? ""),
    queryFn: () => DashboardService.getPaymentPromisesStats(companyId!),
    enabled: Boolean(companyId),
    staleTime: 1000 * 25,
    refetchInterval: REFETCH_INTERVAL,
    placeholderData: (prev) => prev,
  });
}

export function useDashboardAgingQuery() {
  const { data: me } = useMeQuery();
  const companyId = me?.company?.id;

  return useQuery({
    queryKey: queryKeys.dashboard.aging(companyId ?? ""),
    queryFn: () => DashboardService.getDelinquencyAging(companyId!),
    enabled: Boolean(companyId),
    staleTime: 1000 * 25,
    refetchInterval: REFETCH_INTERVAL,
    placeholderData: (prev) => prev,
  });
}

export function useDashboardForecastQuery() {
  const { data: me } = useMeQuery();
  const companyId = me?.company?.id;

  return useQuery({
    queryKey: queryKeys.dashboard.forecast(companyId ?? ""),
    queryFn: () => DashboardService.getPaymentForecast(companyId!),
    enabled: Boolean(companyId),
    staleTime: 1000 * 25,
    refetchInterval: REFETCH_INTERVAL,
    placeholderData: (prev) => prev,
  });
}

export function useDashboardDebtConversionQuery() {
  const { data: me } = useMeQuery();
  const companyId = me?.company?.id;

  return useQuery({
    queryKey: queryKeys.dashboard.debtConversion(companyId ?? ""),
    queryFn: () => DashboardService.getDebtConversion(companyId!),
    enabled: Boolean(companyId),
    staleTime: 1000 * 25,
    refetchInterval: REFETCH_INTERVAL,
    placeholderData: (prev) => prev,
  });
}
