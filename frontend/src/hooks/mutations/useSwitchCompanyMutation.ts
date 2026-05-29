import { useMutation } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { CompanyService } from "../../services/company/company.service";
import { applyLoginSession } from "../../services/auth/auth.service";
import { AppStorage } from "../../services/storage/storage.service";
import { notifyActiveCompanyChanged } from "../../services/session/activeCompanyEvents";
import { getErrorMessage } from "../../utils/error";
import type { SwitchCompanyResponse } from "../../types/authApiTypes";

/**
 * Troca a empresa ativa da sessao (super_admin).
 *
 * Fluxo do `onSuccess`:
 *   1. `applyLoginSession` reescreve token / account / company no storage.
 *   2. Persiste o id da empresa em `LAST_ACTIVE_COMPANY_ID`.
 *   3. Notifica o `ActiveCompanyContext` via evento custom (desacoplado).
 *   4. Recarrega a pagina inteira na MESMA tela/URL.
 *
 * Por que reload em vez de `invalidateQueries`: varios contextos
 * (campaigns/invoices/dashboard) e o `useAccountParam` leem o account no mount
 * e nao reagem a troca de empresa. O reload garante que todos reidratem do
 * storage novo, evitando dados da empresa anterior na tela.
 *
 * O `account` da URL e atualizado para `response.company.account` ANTES do
 * reload: o `AccountLayout` valida `?account=` contra o `me()` e re-navega se
 * divergir, entao deixar o account antigo na URL causaria flicker/conflito.
 * Por consequencia o toast de sucesso normalmente nao chega a ser exibido — e
 * aceitavel (a nova empresa ja aparece na navbar apos o reload).
 */
export function useSwitchCompanyMutation() {
  return useMutation<SwitchCompanyResponse, unknown, string>({
    mutationFn: (id: string) => CompanyService.switchCompany(id),
    onSuccess: (response) => {
      applyLoginSession(response);
      AppStorage.setLastActiveCompanyId(response.company.id);
      AppStorage.setAuthMode("agent");

      notifyActiveCompanyChanged();

      const url = new URL(window.location.href);
      url.searchParams.set("account", response.company.account);
      url.searchParams.delete("chatwoot_token");
      url.searchParams.delete("token");
      window.location.href = url.toString();
    },
    onError: (error) => {
      console.error("[useSwitchCompanyMutation] Falha ao trocar empresa", error);
      toast.error(getErrorMessage(error, "Nao foi possivel trocar de empresa."));
    },
  });
}
