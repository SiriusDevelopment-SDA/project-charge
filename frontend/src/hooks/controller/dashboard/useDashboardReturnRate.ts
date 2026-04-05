import { useDashboardReturnRateQuery } from "../../queries/useDashboardQueries";
import type { MonthlyReturnData } from "../../../services/dashboard/dashboard.service";

export function useDashboardReturnRate() {
  const { data: returnRate = [] as MonthlyReturnData[], isLoading: loading } =
    useDashboardReturnRateQuery();
  return { returnRate, loading };
}
