import { useDashboardDebtConversionQuery } from "../../queries/useDashboardQueries";
import type { DebtConversionData } from "../../../services/dashboard/dashboard.service";

const defaultData: DebtConversionData = {
  brackets: [
    { label: "até R$1k", total: 0, kept: 0, keptRate: 0 },
    { label: "R$1k–5k", total: 0, kept: 0, keptRate: 0 },
    { label: "R$5k–10k", total: 0, kept: 0, keptRate: 0 },
    { label: "R$10k–50k", total: 0, kept: 0, keptRate: 0 },
    { label: "+R$50k", total: 0, kept: 0, keptRate: 0 },
  ],
};

export function useDashboardDebtConversion() {
  const { data, isLoading } = useDashboardDebtConversionQuery();
  return { debtConversion: data ?? defaultData, loading: isLoading };
}
