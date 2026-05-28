import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { CompanyService } from "../../services/company/company.service";
import { applyLoginSession } from "../../services/auth/auth.service";
import { AppStorage } from "../../services/storage/storage.service";
import { notifyActiveCompanyChanged } from "../../context/contextActiveCompany";
import { getErrorMessage } from "../../utils/error";
import type { SwitchCompanyResponse } from "../../types/authApiTypes";

/**
 * Troca a empresa ativa da sessao (super_admin).
 *
 * Fluxo do `onSuccess`:
 *   1. `applyLoginSession` reescreve token / account / company no storage.
 *   2. Persiste o id da empresa em `LAST_ACTIVE_COMPANY_ID`.
 *   3. Notifica o `ActiveCompanyContext` via evento custom (desacoplado).
 *   4. Invalida o cache do React Query, exceto a lista de empresas.
 *   5. Toast de sucesso.
 */
export function useSwitchCompanyMutation() {
  const queryClient = useQueryClient();

  return useMutation<SwitchCompanyResponse, unknown, string>({
    mutationFn: (id: string) => CompanyService.switchCompany(id),
    onSuccess: (response) => {
      applyLoginSession(response);
      AppStorage.setLastActiveCompanyId(response.company.id);
      AppStorage.setAuthMode("agent");

      notifyActiveCompanyChanged();

      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== "companies",
      });

      const companyName = response.company.name?.trim() || response.company.account;
      toast.success(`Empresa ativa alterada para ${companyName}.`);
    },
    onError: (error) => {
      console.error("[useSwitchCompanyMutation] Falha ao trocar empresa", error);
      toast.error(getErrorMessage(error, "Nao foi possivel trocar de empresa."));
    },
  });
}
