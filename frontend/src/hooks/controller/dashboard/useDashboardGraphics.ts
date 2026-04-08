import { useDashboardChargesQuery } from "../../queries/useDashboardQueries";

const EMPTY_CHARGES = { months: [], inadimplentes: 0, pagamentos: 0 };

export function useDashboardGraphics() {
  const { data = EMPTY_CHARGES, isLoading: loading } = useDashboardChargesQuery();
  const total = data.inadimplentes + data.pagamentos;
  const delinquencyRate = total > 0 ? Number(((data.inadimplentes / total) * 100).toFixed(1)) : 0;
  return { charges: data.months, delinquencyRate, loading };
}
