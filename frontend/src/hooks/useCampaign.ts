import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { CampaignMetrics } from "../types";
import { useAccountParam } from "./useAccountParam";
import { queryKeys } from "../lib/queryKeys";
import {
  useCampaignsQuery,
  useCampaignMetricsQuery,
  useCategoriesQuery,
} from "./queries/useCampaignsQuery";
import {
  useDeleteCampaignMutation,
  useUpdateCampaignStatusMutation,
} from "./mutations/useCampaignMutations";

export type LoadingReq = "" | "FINDALL" | "DELETE";
export type LoadingType = "CATEGORIES" | "CAMPAIGN";
export type LoadingState = {
  status: boolean;
  req: LoadingReq;
  type: LoadingType;
};

const DEFAULT_METRICS: CampaignMetrics = {
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

export function useCampaign() {
  const account = useAccountParam() ?? "";
  const queryClient = useQueryClient();

  const { data: campaigns = [], isLoading: campaignsLoading } = useCampaignsQuery();
  const { data: metrics = DEFAULT_METRICS } = useCampaignMetricsQuery();
  const { data: categories = [] } = useCategoriesQuery();

  const deleteMutation = useDeleteCampaignMutation();
  const updateStatusMutation = useUpdateCampaignStatusMutation();

  const loading: LoadingState = {
    status: campaignsLoading,
    req: campaignsLoading ? "FINDALL" : "",
    type: "CAMPAIGN",
  };

  const reload = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.campaigns.all(account),
        exact: true,
        refetchType: "all",
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.campaigns.metricsBase(account),
        refetchType: "all",
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.campaigns.collectionsMetrics(account),
        exact: true,
        refetchType: "all",
      }),
    ]);
  }, [queryClient, account]);

  const deleteCampaign = useCallback(
    async (id: string): Promise<{ success: boolean }> => {
      try {
        const result = await deleteMutation.mutateAsync(id);
        return { success: result?.success ?? false };
      } catch {
        return { success: false };
      }
    },
    [deleteMutation],
  );

  const updateCampaignStatus = useCallback(
    (id: string, isEnabled: boolean) => {
      updateStatusMutation.mutate({ id, payload: { isEnabled } });
    },
    [updateStatusMutation],
  );

  return {
    campaigns,
    categories,
    metrics,
    loading,
    reload,
    deleteCampaign,
    updateCampaignStatus,
  };
}
