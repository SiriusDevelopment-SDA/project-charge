import { io, type Socket } from "socket.io-client";
import { Api } from "../api";

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
