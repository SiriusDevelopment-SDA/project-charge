import { useEffect, useState } from "react";
import { DashboardService, type MonthlyReturnData } from "../../../services/dashboard/dashboard.service";
import { AuthService } from "../../../services/auth/auth.service";
import { toast } from "react-toastify";
import { getErrorMessage } from "../../../utils/error";

export function useDashboardReturnRate() {
    const [returnRate, setReturnRate] = useState<MonthlyReturnData[]>([]);
    const [loading, setLoading] = useState<boolean>(false);

    useEffect(() => {
        const fetchReturnRate = async () => {
            setLoading(true);
            try {
                const result = await AuthService.me();
                const data = await DashboardService.getMonthlyReturnRate(result.company.id);
                setReturnRate(data);
            } catch (error) {
                toast.error(getErrorMessage(error, "Erro ao carregar retorno de disparo."));
            } finally {
                setLoading(false);
            }
        };

        void fetchReturnRate();
    }, []);

    return { returnRate, loading };
}
