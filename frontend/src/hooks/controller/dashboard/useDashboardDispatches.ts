import { useEffect, useState } from "react";
import { DashboardService, type MonthlyDispatchData } from "../../../services/dashboard/dashboard.service";
import { AuthService } from "../../../services/auth/auth.service";
import { toast } from "react-toastify";
import { getErrorMessage } from "../../../utils/error";

export function useDashboardDispatches() {
    const [dispatches, setDispatches] = useState<MonthlyDispatchData[]>([]);
    const [loading, setLoading] = useState<boolean>(false);

    useEffect(() => {
        const fetchDispatches = async () => {
            setLoading(true);
            try {
                const result = await AuthService.me();
                const data = await DashboardService.getMonthlyDispatches(result.company.id);
                setDispatches(data);
            } catch (error) {
                toast.error(getErrorMessage(error, "Erro ao carregar dados de disparo."));
            } finally {
                setLoading(false);
            }
        };

        void fetchDispatches();
    }, []);

    return { dispatches, loading };
}
