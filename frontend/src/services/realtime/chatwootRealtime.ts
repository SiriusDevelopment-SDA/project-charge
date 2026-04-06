export type ChatwootRealtimeConfig = {
  cableUrl: string;
  pubsubToken: string;
  accountId: number;
  userId: number;
};

export type ChatwootRealtimeEvent = {
  event: string;
  data: Record<string, unknown> | null;
};

type ChatwootRealtimeHandlers = {
  onOpen?: () => void;
  onClose?: () => void;
  onError?: () => void;
  onEvent?: (event: ChatwootRealtimeEvent) => void;
};

const PRESENCE_INTERVAL_MS = 30_000;
const RECONNECT_DELAY_MS = 3_000;

function stringify(payload: Record<string, unknown>) {
  return JSON.stringify(payload);
}

function buildIdentifier(config: ChatwootRealtimeConfig) {
  return stringify({
    channel: "RoomChannel",
    pubsub_token: config.pubsubToken,
    account_id: config.accountId,
    user_id: config.userId,
  });
}

export function createChatwootRealtimeConnection(
  config: ChatwootRealtimeConfig,
  handlers: ChatwootRealtimeHandlers,
) {
  let socket: WebSocket | null = null;
  let heartbeatId: number | null = null;
  let reconnectId: number | null = null;
  let manuallyClosed = false;
  const identifier = buildIdentifier(config);

  const clearHeartbeat = () => {
    if (heartbeatId != null) {
      window.clearInterval(heartbeatId);
      heartbeatId = null;
    }
  };

  const clearReconnect = () => {
    if (reconnectId != null) {
      window.clearTimeout(reconnectId);
      reconnectId = null;
    }
  };

  const sendPresence = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(
      stringify({
        command: "message",
        identifier,
        data: stringify({ action: "update_presence" }),
      }),
    );
  };

  const connect = () => {
    clearReconnect();
    socket = new WebSocket(config.cableUrl);

    socket.addEventListener("open", () => {
      socket?.send(
        stringify({
          command: "subscribe",
          identifier,
        }),
      );
    });

    socket.addEventListener("message", (rawEvent) => {
      try {
        const payload = JSON.parse(String(rawEvent.data ?? "{}")) as {
          type?: string;
          message?: { event?: string; data?: Record<string, unknown> | null };
        };

        if (payload.type === "confirm_subscription") {
          sendPresence();
          clearHeartbeat();
          heartbeatId = window.setInterval(sendPresence, PRESENCE_INTERVAL_MS);
          handlers.onOpen?.();
          return;
        }

        const eventName = payload.message?.event;
        if (!eventName) return;

        handlers.onEvent?.({
          event: eventName,
          data: payload.message?.data ?? null,
        });
      } catch {
        // Ignore malformed frames to keep the connection resilient.
      }
    });

    socket.addEventListener("close", () => {
      clearHeartbeat();
      handlers.onClose?.();

      if (!manuallyClosed) {
        clearReconnect();
        reconnectId = window.setTimeout(connect, RECONNECT_DELAY_MS);
      }
    });

    socket.addEventListener("error", () => {
      handlers.onError?.();
    });
  };

  connect();

  return {
    disconnect() {
      manuallyClosed = true;
      clearHeartbeat();
      clearReconnect();
      socket?.close();
      socket = null;
    },
  };
}
