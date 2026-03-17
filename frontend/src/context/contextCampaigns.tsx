import { useEffect, type ReactNode } from "react";
import { setupCampaignsSocket } from "../services/realtime/campaignsRealtime";
import { useAccountParam } from "../hooks/useAccountParam";

export function CampaignProvider({ children }: { children: ReactNode }) {
  const account = useAccountParam();

  useEffect(() => {
    if (!account) return;
    return setupCampaignsSocket(account);
  }, [account]);

  return <>{children}</>;
}
