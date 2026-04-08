import { useDashboardPaymentProfileQuery } from "../../queries/useDashboardQueries";

const EMPTY: { distribution: { label: string; count: number; pct: number }[]; trend: { month: string; onTimePct: number }[] } = {
  distribution: [],
  trend: [],
};

export function useDashboardPaymentProfile() {
  const { data = EMPTY, isLoading: loading } = useDashboardPaymentProfileQuery();
  return { profile: data, loading };
}
