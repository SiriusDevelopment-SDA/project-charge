import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { CampaignService } from "../../services/campaign/campaign.service";
import { DashboardService } from "../../services/dashboard/dashboard.service";
import { useMe } from "../useMe";
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
  recoveredAmount: 0,
  convertedCount: 0,
  respondedAndPaid: 0,
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

// Reaproveita a fonte unica `useMe` (mesma queryKey ["auth","me"]) para nao
// duplicar a chamada de `GET /auth/me`.
const useMeQuery = useMe;

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
  // Usa o `account` (empresa VISUALIZADA na URL), igual aos cards de métricas e
  // à tela Campanhas. Antes usava `me.company.id` (empresa do usuário LOGADO),
  // que diverge quando um super_admin troca de conta — a aba vinha vazia.
  const account = useAccountParam();

  return useQuery({
    queryKey: queryKeys.dashboard.campaigns(account ?? ""),
    queryFn: () => DashboardService.getCampaignsStats(account),
    enabled: Boolean(account),
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

export function useDashboardPaymentProfileQuery() {
  const { data: me } = useMeQuery();
  const companyId = me?.company?.id;

  return useQuery({
    queryKey: queryKeys.dashboard.paymentProfile(companyId ?? ""),
    queryFn: () => DashboardService.getPaymentProfile(companyId!),
    enabled: Boolean(companyId),
    staleTime: 1000 * 25,
    refetchInterval: REFETCH_INTERVAL,
    placeholderData: (prev) => prev,
  });
}
