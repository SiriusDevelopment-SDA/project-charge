import { io, type Socket } from "socket.io-client";
import { Api } from "../api";

const CHAT_NAMESPACE = "/chat";

function getSocketBaseUrl() {
  const apiBase = String(Api.defaults.baseURL ?? window.location.origin);
  return apiBase.replace(/\/api\/?$/, "");
}

export type ChatSyncMessage = {
  id: string;
  content: string;
  senderType: string;
  senderName: string | null;
  createdAt: string;
};

export type ChatSyncPayload = {
  account: string;
  at: string;
  conversationId?: number;
  message?: ChatSyncMessage;
};

type ChatRealtimeHandlers = {
  onSync: (data: ChatSyncPayload) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
};

export function setupChatSocket(account: string, handlers: ChatRealtimeHandlers): () => void {
  const baseUrl = getSocketBaseUrl();

  const socket: Socket = io(`${baseUrl}${CHAT_NAMESPACE}`, {
    autoConnect: true,
    transports: ["websocket", "polling"],
    query: { account },
  });

  socket.on("connect", () => {
    socket.emit("chat:subscribe", { account });
    handlers.onConnect?.();
  });

  socket.on("disconnect", () => {
    handlers.onDisconnect?.();
  });

  socket.on("chat:sync", (data: ChatSyncPayload) => {
    handlers.onSync(data);
  });

  return () => {
    socket.off("chat:sync");
    socket.off("connect");
    socket.off("disconnect");
    socket.disconnect();
  };
}
