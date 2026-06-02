import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { CompanyService } from "../../services/company/company.service";
import { AppStorage } from "../../services/storage/storage.service";

/**
 * Lista de empresas visiveis para o usuario autenticado.
 *
 * Endpoint exclusivo de `super_admin` — qualquer outro papel recebe 403/404,
 * entao habilitamos a query somente quando o role armazenado for `super_admin`.
 */
export function useCompaniesQuery() {
  const isSuperAdmin = AppStorage.getAgentRole() === "super_admin";

  return useQuery({
    queryKey: queryKeys.companies.list(),
    queryFn: CompanyService.listCompanies,
    enabled: isSuperAdmin,
    staleTime: 1000 * 60 * 5,
  });
}
