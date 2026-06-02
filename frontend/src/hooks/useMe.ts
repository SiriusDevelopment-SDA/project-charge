import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../lib/queryKeys";
import { AuthService } from "../services/auth/auth.service";

/**
 * Fonte unica do `GET /auth/me` no React Query.
 *
 * Usa a mesma queryKey (`queryKeys.auth.me()` === ["auth","me"]) do
 * `useDashboardQueries`, de modo que o cache e compartilhado e a chamada
 * NAO e duplicada. Qualquer feature que precise dos dados da empresa ativa
 * (canais NotificaMe, permissoes etc.) deve derivar daqui.
 */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: () => AuthService.me(),
    staleTime: 1000 * 60 * 10,
  });
}
