import { useDashboardChargesQuery } from "../../queries/useDashboardQueries";

export function useDashboardGraphics() {
  const { data: charges = [], isLoading: loading } = useDashboardChargesQuery();
  return { charges, loading };
}
