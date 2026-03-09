import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { CampaignService } from "../../../services/campaign/campaign.service";
import type { CollectionsMetrics } from "../../../types";
import { getErrorMessage } from "../../../utils/error";

const initialMetrics: CollectionsMetrics = {
  chargedCustomers30d: 0,
  respondedAfterCharge30d: 0,
  responseRate30d: 0,
  openFollowups: 0,
  noResponseOver24h: 0,
  lastResponseAt: null,
};

export function useDashboardCollectionsMetrics() {
  const [metrics, setMetrics] = useState<CollectionsMetrics>(initialMetrics);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const account = new URLSearchParams(window.location.search).get("account");
        const response = await CampaignService.collectionsMetrics(account);
        setMetrics(response);
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Erro ao carregar metricas de cobranca."));
      }
    };

    void fetchMetrics();
  }, []);

  return { metrics };
}
