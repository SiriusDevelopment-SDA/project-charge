import { io, type Socket } from "socket.io-client";
import { Api } from "../api";

const INVOICES_NAMESPACE = "/invoices";

function getSocketBaseUrl() {
  const apiBase = String(Api.defaults.baseURL ?? window.location.origin);
  return apiBase.replace(/\/api\/?$/, "");
}

export function createInvoicesSocket(account: string): Socket {
  const baseUrl = getSocketBaseUrl();

  return io(`${baseUrl}${INVOICES_NAMESPACE}`, {
    autoConnect: true,
    transports: ["websocket", "polling"],
    query: { account },
  });
}
