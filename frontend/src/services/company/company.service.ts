import { Api } from "../api";
import type { CompanyListItem } from "../../types/companyApiTypes";
import type { SwitchCompanyResponse } from "../../types/authApiTypes";

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
