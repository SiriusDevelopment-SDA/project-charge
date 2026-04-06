import { io, type Socket } from "socket.io-client";
import { Api } from "../api";
import { queryClient } from "../../lib/queryClient";
import { queryKeys } from "../../lib/queryKeys";

const CAMPAIGNS_NAMESPACE = "/campaigns";

function getSocketBaseUrl() {
  const apiBase = String(Api.defaults.baseURL ?? window.location.origin);
  return apiBase.replace(/\/api\/?$/, "");
}

export function createCampaignsSocket(account: string): Socket {
  const baseUrl = getSocketBaseUrl();

  return io(`${baseUrl}${CAMPAIGNS_NAMESPACE}`, {
    autoConnect: true,
    transports: ["websocket", "polling"],
    query: { account },
  });
}

export function setupCampaignsSocket(account: string): () => void {
  const socket = createCampaignsSocket(account);

  socket.on("connect", () => {
    socket.emit("campaigns:subscribe", { account });
  });

  socket.on("campaigns:sync", () => {
    void Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.campaigns.all(account),
        exact: true,
        refetchType: "all",
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.campaigns.metricsBase(account),
        refetchType: "all",
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.campaigns.collectionsMetrics(account),
        exact: true,
        refetchType: "all",
      }),
      // Dashboard charts also depend on dispatch/campaign data — refresh them too
      queryClient.invalidateQueries({
        queryKey: ["dashboard"],
        refetchType: "all",
      }),
    ]);
  });

  return () => {
    socket.off("campaigns:sync");
    socket.disconnect();
  };
}
