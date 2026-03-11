import {
    createContext,
    useMemo,
    type ReactNode,
} from "react";
import { type ChargesData } from "../types/dashboardApiTypes";
import { useDashboardGraphics } from "../hooks/controller/dashboard/useDashboardGraphics";

type DashboardContextValue = {
    charges: ChargesData[];
    loading: boolean;
};

export const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
    const { charges, loading } = useDashboardGraphics();

    const value = useMemo<DashboardContextValue>(
        () => ({
            charges,
            loading,
        }),
        [charges, loading]
    );

    return (
        <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
    );
}
