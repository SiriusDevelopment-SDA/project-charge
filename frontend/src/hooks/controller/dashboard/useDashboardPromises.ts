import { useDashboardPromisesQuery } from "../../queries/useDashboardQueries";
import type { PromisesStatsData } from "../../../services/dashboard/dashboard.service";

const defaultData: PromisesStatsData = {
  total: 0,
  kept: 0,
  broken: 0,
  pending: 0,
  cancelled: 0,
  keptAmount: 0,
  keptRate: 0,
  monthly: [],
};

export function useDashboardPromises() {
  const { data, isLoading } = useDashboardPromisesQuery();
  return { promises: data ?? defaultData, loading: isLoading };
}
