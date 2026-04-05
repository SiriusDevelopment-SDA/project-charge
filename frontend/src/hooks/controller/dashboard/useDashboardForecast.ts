import { useDashboardForecastQuery } from "../../queries/useDashboardQueries";
import type { ForecastData } from "../../../services/dashboard/dashboard.service";

const defaultData: ForecastData = {
  weeks: [
    { label: "Semana 1", amount: 0, count: 0 },
    { label: "Semana 2", amount: 0, count: 0 },
    { label: "Semana 3", amount: 0, count: 0 },
    { label: "Semana 4+", amount: 0, count: 0 },
  ],
  total: 0,
};

export function useDashboardForecast() {
  const { data, isLoading } = useDashboardForecastQuery();
  return { forecast: data ?? defaultData, loading: isLoading };
}
