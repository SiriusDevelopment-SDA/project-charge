import { useCollectionsMetricsQuery, initialCollectionsMetrics } from "../../queries/useDashboardQueries";

export function useDashboardCollectionsMetrics() {
  const { data: metrics = initialCollectionsMetrics } = useCollectionsMetricsQuery();
  return { metrics };
}
