import { useDashboardAgingQuery } from "../../queries/useDashboardQueries";
import type { AgingData } from "../../../services/dashboard/dashboard.service";

const defaultData: AgingData = {
  buckets: [
    { label: "1-30 dias", count: 0, totalValue: 0 },
    { label: "31-60 dias", count: 0, totalValue: 0 },
    { label: "61-90 dias", count: 0, totalValue: 0 },
    { label: "91-120 dias", count: 0, totalValue: 0 },
    { label: "+120 dias", count: 0, totalValue: 0 },
  ],
};

export function useDashboardAging() {
  const { data, isLoading } = useDashboardAgingQuery();
  return { aging: data ?? defaultData, loading: isLoading };
}
