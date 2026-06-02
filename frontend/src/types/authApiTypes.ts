/**
 * Tipos do contrato de autenticacao com o backend.
 *
 * Fonte unica de verdade para respostas de login / switch-company / me.
 * Mantenha alinhado com os DTOs em `backend/src/auth/`.
 */

export type AgentRole = "admin" | "operator" | "super_admin";

export type AuthPermissions = {
  dashboard: boolean;
  clientesVencidos: boolean;
  chat: boolean;
};

export type AuthCompany = {
  id: string;
  name: string;
  account: string;
  active: boolean;
};

export type AuthAgent = {
  id: string;
  name: string | null;
  email: string | null;
  role: AgentRole;
  active: boolean;
};

export type LoginResponse = {
  success: boolean;
  accessToken: string;
  company: AuthCompany;
  permissions?: AuthPermissions | null;
  agent?: AuthAgent | null;
};

/**
 * Resposta de POST /api/auth/switch-company/:id.
 * Mesmo shape do login para que `applyLoginSession` reaproveite a persistencia.
 */
export type SwitchCompanyResponse = LoginResponse;
