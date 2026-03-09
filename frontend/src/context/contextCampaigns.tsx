import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { CampaignData, CampaignMetrics, Category } from "../types";
import type { LoadingState } from "../hooks/controller/campaigns/useCampaignsController";
import { useCampaignsController } from "../hooks/controller/campaigns/useCampaignsController";
import type { Socket } from "socket.io-client";
import { createCampaignsSocket } from "../services/realtime/campaignsRealtime";

const CAMPAIGNS_POLLING_INTERVAL_MS = 60000;

type CampaignContextValue = {
  campaigns: CampaignData[];
  categories: Category[];
  metrics: CampaignMetrics;
  loading: LoadingState;
  reload: () => Promise<void>;
  deleteCampaign: (id: string) => Promise<{ success: boolean }>;
  updateCampaignStatus: (id: string, isEnabled: boolean) => void;
};

// eslint-disable-next-line react-refresh/only-export-components
export const CampaignContext = createContext<CampaignContextValue | null>(null);

export function CampaignProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const {
    state,
    loadInitialData,
    refreshRealtime,
    deleteCampaign,
    updateCampaignStatus,
  } = useCampaignsController();

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    const account = new URLSearchParams(window.location.search).get("account");
    if (!account) return;

    const socket = createCampaignsSocket(account);
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("campaigns:subscribe", { account });
    });

    socket.on("campaigns:sync", () => {
      void refreshRealtime();
    });

    return () => {
      socket.off("campaigns:sync");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [refreshRealtime]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshRealtime();
    }, CAMPAIGNS_POLLING_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [refreshRealtime]);

  const reload = useCallback(async () => {
    await loadInitialData();
  }, [loadInitialData]);

  const value = useMemo<CampaignContextValue>(
    () => ({
      campaigns: state.campaigns,
      categories: state.categories,
      metrics: state.metrics,
      loading: state.loading,
      reload,
      deleteCampaign,
      updateCampaignStatus,
    }),
    [
      state.campaigns,
      state.categories,
      state.metrics,
      state.loading,
      reload,
      deleteCampaign,
      updateCampaignStatus,
    ]
  );

  return (
    <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>
  );
}

