import { useDashboardCampaignsStatsQuery } from "../../queries/useDashboardQueries";
import type { CampaignStatData } from "../../../services/dashboard/dashboard.service";

export function useDashboardCampaignsStats() {
  const { data: campaigns = [] as CampaignStatData[], isLoading: loading } =
    useDashboardCampaignsStatsQuery();
  return { campaigns, loading };
}
