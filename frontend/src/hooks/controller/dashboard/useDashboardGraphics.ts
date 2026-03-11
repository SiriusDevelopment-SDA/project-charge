import { useEffect, useState } from "react";
import { DashboardService } from "../../../services/dashboard/dashboard.service";
import type { ChargesData } from "../../../types/dashboardApiTypes";
import { AuthService } from "../../../services/auth/auth.service";
import { toast } from "react-toastify";
import { getErrorMessage } from "../../../utils/error";

export function useDashboardGraphics() {
    const [charges, setCharges] = useState<ChargesData[]>([]);
    const [loading, setLoading] = useState<boolean>(false);

    useEffect(() => {
        const fetchCharges = async () => {
            setLoading(true)
            try {
                const result = await AuthService.me();
                const data = await DashboardService.getCharges(result.company.id)
                setCharges(data)
            } catch (error) {
                toast.error(getErrorMessage(error, "Erro ao carregar metricas de cobranca."));
            } finally {
                setLoading(false)
            }
        };

        void fetchCharges();

    }, []);

    return { charges, loading}
}