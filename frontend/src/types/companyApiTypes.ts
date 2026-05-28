/**
 * Tipos do contrato de companies (super_admin).
 *
 * GET /api/companies retorna a lista visivel apenas para super_admin.
 */

export type CompanyListItem = {
  id: string;
  name: string;
  account_chatwoot: string;
  label: string;
  active: boolean;
};
