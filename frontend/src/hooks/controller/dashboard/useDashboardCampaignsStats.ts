import { useEffect, useState } from "react";
import { DashboardService, type CampaignStatData } from "../../../services/dashboard/dashboard.service";
import { AuthService } from "../../../services/auth/auth.service";
import { toast } from "react-toastify";
import { getErrorMessage } from "../../../utils/error";

export function useDashboardCampaignsStats() {
    const [campaigns, setCampaigns] = useState<CampaignStatData[]>([]);
    const [loading, setLoading] = useState<boolean>(false);

    useEffect(() => {
        const fetchCampaigns = async () => {
            setLoading(true);
            try {
                const result = await AuthService.me();
                const data = await DashboardService.getCampaignsStats(result.company.id);
                setCampaigns(data);
            } catch (error) {
                toast.error(getErrorMessage(error, "Erro ao carregar campanhas."));
            } finally {
                setLoading(false);
            }
        };

        void fetchCampaigns();
    }, []);

    return { campaigns, loading };
}
