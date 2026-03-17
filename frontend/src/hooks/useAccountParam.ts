import { useSearchParams } from "react-router-dom";
import { AppStorage } from "../services/storage/storage.service";

/**
 * Retorna o account da URL (?account=...).
 * Fallback para o valor salvo em sessão quando o parâmetro não está presente.
 *
 * Fonte única para leitura do account — não use URLSearchParams diretamente.
 */
export function useAccountParam(): string {
  const [searchParams] = useSearchParams();
  return searchParams.get("account") ?? AppStorage.getAccount();
}
