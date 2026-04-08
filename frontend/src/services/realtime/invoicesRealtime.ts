import { io, type Socket } from "socket.io-client";
import { Api } from "../api";
import { queryClient } from "../../lib/queryClient";

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

export function setupInvoicesSocket(account: string): () => void {
  const socket = createInvoicesSocket(account);

  socket.on("connect", () => {
    socket.emit("invoices:subscribe", { account });
  });

  socket.on("invoices:sync", () => {
    void queryClient.invalidateQueries({
      queryKey: ["clients", account],
      refetchType: "all",
    });
  });

  return () => {
    socket.off("invoices:sync");
    socket.disconnect();
  };
}
