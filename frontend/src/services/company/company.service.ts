import { Api } from "../api";
import { applyLoginSession } from "../auth/auth.service";
import { AppStorage } from "../storage/storage.service";
import type { CompanyListItem } from "../../types/companyApiTypes";
import type { LoginResponse, SwitchCompanyResponse } from "../../types/authApiTypes";

/**
 * Endpoints exclusivos do papel `super_admin`.
 * - GET /companies: lista todas as empresas visiveis.
 * - POST /auth/switch-company/:id: troca a sessao para a empresa alvo,
 *   retornando o mesmo shape de `loginAgent`.
 */
export class CompanyService {
  static async listCompanies(): Promise<CompanyListItem[]> {
    return Api.get<CompanyListItem[]>("/companies").then((response) => response.data);
  }

  static async switchCompany(id: string): Promise<SwitchCompanyResponse> {
    return Api.post<SwitchCompanyResponse>(`/auth/switch-company/${id}`).then(
      (response) => response.data,
    );
  }
}

/**
 * Restaura a ultima empresa ativa de um super_admin logo apos o login externo
 * (e-mail/senha).
 *
 * Contexto: o login de super_admin volta sempre na empresa default (Fibras do
 * Rio). Se o operador ja havia trocado de empresa numa sessao anterior, o id
 * fica salvo em `LAST_ACTIVE_COMPANY_ID`. Esta funcao re-troca para essa
 * empresa ANTES da navegacao para a home, reaproveitando `applyLoginSession`
 * para reescrever a sessao no storage.
 *
 * So age quando TODAS as condicoes batem:
 *   - papel === "super_admin";
 *   - existe `last_active_company_id` salvo;
 *   - esse id difere da empresa que veio no login (default).
 * Caso contrario, retorna sem efeito (mantem a sessao do login).
 *
 * Fallback de erro (ex.: 404 — empresa inativa/sem ERP/deletada): remove o id
 * invalido do storage (para nao retentar sempre), loga no console e mantem a
 * sessao default ja aplicada pelo login — NUNCA propaga o erro nem trava o
 * fluxo de login.
 *
 * Importante: chamar SOMENTE no login externo. Embed/chatwoot/AccountLayout
 * mantem a empresa via token no storage e nao devem usar isto.
 */
export async function restoreLastActiveCompany(
  loginResponse: LoginResponse,
): Promise<void> {
  if (AppStorage.getAgentRole() !== "super_admin") return;

  const lastActiveCompanyId = AppStorage.getLastActiveCompanyId();
  if (!lastActiveCompanyId) return;
  if (lastActiveCompanyId === loginResponse.company.id) return;

  try {
    const switched = await CompanyService.switchCompany(lastActiveCompanyId);
    applyLoginSession(switched);
    AppStorage.setLastActiveCompanyId(switched.company.id);
  } catch (error: unknown) {
    console.error(
      "[restoreLastActiveCompany] Falha ao restaurar ultima empresa ativa; mantendo empresa default do login.",
      { lastActiveCompanyId, error },
    );
    AppStorage.removeLastActiveCompanyId();
  }
}
