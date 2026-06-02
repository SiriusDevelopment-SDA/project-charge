import { useMemo } from "react";
import type { NotificameChannel } from "../types/authApiTypes";
import { useMe } from "./useMe";

type UseNotificameChannelsResult = {
  /** Canais NotificaMe (caixas de disparo) da empresa ativa. */
  channels: NotificameChannel[];
  /** True enquanto o `me()` ainda esta carregando. */
  isLoading: boolean;
  /** True quando o `me()` falhou. */
  isError: boolean;
  /** True quando o carregamento concluiu e a empresa nao possui canais. */
  isEmpty: boolean;
};

/**
 * MC3: expoe os canais NotificaMe da empresa ativa para popular o dropdown
 * de selecao de caixa de disparo (Campanha e, futuramente, disparo manual).
 *
 * Deriva do cache compartilhado de `useMe()` — nao dispara chamada propria
 * alem do `GET /auth/me` ja usado em outras telas.
 */
export function useNotificameChannels(): UseNotificameChannelsResult {
  const { data, isLoading, isError } = useMe();

  const channels = useMemo<NotificameChannel[]>(
    () => data?.company?.channels ?? [],
    [data?.company?.channels],
  );

  return {
    channels,
    isLoading,
    isError,
    isEmpty: !isLoading && !isError && channels.length === 0,
  };
}
