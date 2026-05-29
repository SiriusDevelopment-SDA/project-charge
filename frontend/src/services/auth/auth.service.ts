import { Api } from "../api";
import { AppStorage } from "../storage/storage.service";
import { notifyActiveCompanyChanged } from "../session/activeCompanyEvents";
import { getErrorStatus } from "../../utils/error";
import type {
  AuthPermissions,
  LoginResponse,
} from "../../types/authApiTypes";

type LoginPayload = {
  email: string;
  password: string;
};

type EmbedLoginPayload = {
  account: string;
  token: string;
};

type ChatwootLoginPayload = {
  account: string;
  chatwoot_token: string;
};

/**
 * @deprecated Use `AuthPermissions` de `types/authApiTypes`.
 * Mantido como alias para compatibilidade com imports existentes.
 */
export type PagePermissions = AuthPermissions;

type MeResponse = {
  success: boolean;
  company: {
    id: string;
    name: string;
    account: string;
    cnpj: string;
    active: boolean;
  };
  promiseAutomation: {
    reminderEnabled: boolean;
    reminderTiming: "day_before" | "same_day" | "both";
    autoBreakEnabled: boolean;
    checkPaymentBeforeBreak: boolean;
  };
  permissions?: AuthPermissions | null;
  agent?: {
    id: string;
    name: string | null;
    email: string | null;
    role: "admin" | "operator" | "super_admin";
    active: boolean;
  } | null;
};

export type CompanyAgent = {
  id: string;
  name: string | null;
  email: string | null;
  role: "admin" | "operator" | "super_admin";
  active: boolean;
  createdAt: string;
  updatedAt: string;
  chatwootLinked?: boolean;
};

export type ChatwootConfigStatus = {
  accountId: string;
  teamChargeId: string;
  platformTokenConfigured: boolean;
  adminTokenConfigured: boolean;
  platformAccessOk: boolean;
  platformAccessMessage: string;
};

type CreateAgentPayload = {
  name: string;
  email: string;
  password: string;
  role: "admin" | "operator" | "super_admin";
};

type UpdateProfilePayload = {
  name?: string;
  currentPassword?: string;
  newPassword?: string;
};

type UpdateProfileResponse = {
  success: boolean;
  message: string;
  agent: {
    id: string;
    name: string | null;
    email: string | null;
    role: "admin" | "operator" | "super_admin";
    active: boolean;
  };
};

export type PromiseAutomationSettings = {
  reminderEnabled: boolean;
  reminderTiming: "day_before" | "same_day" | "both";
  autoBreakEnabled: boolean;
  checkPaymentBeforeBreak: boolean;
  reminderTemplateId: string | null;
  reminderTemplateName: string | null;
};

type PromiseAutomationResponse = {
  success: boolean;
  message?: string;
  promiseAutomation: PromiseAutomationSettings;
};

type TeamResponse = {
  success: boolean;
  agents: CompanyAgent[];
};

type RemoveAgentResponse = {
  success: boolean;
  message: string;
  removedAgent: {
    id: string;
    name: string | null;
    email: string | null;
    role?: "admin" | "operator" | "super_admin";
  };
};

type ManageAgentResponse = {
  success: boolean;
  message: string;
  agent: {
    id: string;
    name: string | null;
    email: string | null;
    role: "admin" | "operator" | "super_admin";
    active: boolean;
    chatwootLinked?: boolean;
  };
};

type ChatwootConfigResponse = {
  success: boolean;
  chatwoot: ChatwootConfigStatus;
};

type SyncChatwootAgentsResponse = {
  success: boolean;
  message: string;
  synced: number;
  skipped: number;
  imported: number;
  linked: number;
  roleUpdated: number;
};

const DEFAULT_PERMISSIONS: AuthPermissions = {
  dashboard: true,
  clientesVencidos: true,
  chat: true,
};

/**
 * Persiste no `AppStorage` os campos da resposta de login (ou de switch-company,
 * que tem o mesmo shape).
 *
 * Centraliza a logica de persistencia de sessao para evitar duplicacao entre
 * `Login.tsx`, os fluxos de embed/chatwoot em `AccountLayout.tsx` e o mutation
 * de troca de empresa do super_admin.
 *
 * Importante: nao define `authMode` aqui — cada caller escolhe entre "agent"
 * (login normal / switch) e "embed" (chatwoot/embed-login).
 *
 * Ao final notifica o `ActiveCompanyContext` (`notifyActiveCompanyChanged`):
 * mudancas no `localStorage` na MESMA aba nao disparam o evento `storage`
 * nativo, entao sem isso o provider — hidratado so no mount — nao re-leria a
 * empresa apos o login, e a navbar mostraria o fallback "Trocar empresa".
 */
export function applyLoginSession(response: LoginResponse): void {
  AppStorage.setAccessToken(response.accessToken);
  AppStorage.setAccount(response.company.account);
  AppStorage.setCompanyId(response.company.id);
  AppStorage.setCompanyName(response.company.name);
  AppStorage.setCompanyActive(response.company.active);
  AppStorage.setPagePermissions(response.permissions ?? DEFAULT_PERMISSIONS);

  if (response.agent?.name) {
    AppStorage.setAgentName(response.agent.name);
  }
  if (response.agent?.role) {
    AppStorage.setAgentRole(response.agent.role);
  }

  notifyActiveCompanyChanged();
}

export class AuthService {
  static async login(payload: LoginPayload): Promise<LoginResponse> {
    const { data } = await Api.post<LoginResponse>("/auth/login", payload);
    return data;
  }

  static async embedLogin(payload: EmbedLoginPayload): Promise<LoginResponse> {
    try {
      const { data } = await Api.post<LoginResponse>("/auth/embed-login", payload);
      return data;
    } catch (error: unknown) {
      const status = getErrorStatus(error);
      if (status === 404) {
        // Compatibilidade com backend legado que ainda usa /auth/login (account+token).
        const { data } = await Api.post<LoginResponse>("/auth/login", payload);
        return data;
      }

      throw error;
    }
  }

  static async chatwootLogin(payload: ChatwootLoginPayload): Promise<LoginResponse> {
    const { data } = await Api.post<LoginResponse>("/auth/chatwoot-login", payload);
    return data;
  }

  static async me(): Promise<MeResponse> {
    const { data } = await Api.get<MeResponse>("/auth/me");
    return data;
  }

  static async updateProfile(
    payload: UpdateProfilePayload,
  ): Promise<UpdateProfileResponse> {
    const { data } = await Api.patch<UpdateProfileResponse>("/auth/me", payload);
    return data;
  }

  static async listTeam(): Promise<TeamResponse> {
    const { data } = await Api.get<TeamResponse>("/auth/me/team");
    return data;
  }

  static async createTeamAgent(
    payload: CreateAgentPayload,
  ): Promise<{ success: boolean; message?: string; agent: CompanyAgent }> {
    const { data } = await Api.post<{ success: boolean; message?: string; agent: CompanyAgent }>(
      "/auth/me/team",
      payload,
    );
    return data;
  }

  static async manageAgent(
    agentId: string,
    payload: {
      role?: "admin" | "operator" | "super_admin";
      active?: boolean;
      chatwootAccessToken?: string | null;
    },
  ): Promise<ManageAgentResponse> {
    const { data } = await Api.patch<ManageAgentResponse>(
      `/auth/agents/${agentId}`,
      payload,
    );
    return data;
  }

  static async removeAgent(agentId: string): Promise<RemoveAgentResponse> {
    const { data } = await Api.delete<RemoveAgentResponse>(`/auth/agents/${agentId}`);
    return data;
  }

  static async getChatwootConfig(): Promise<ChatwootConfigResponse> {
    const { data } = await Api.get<ChatwootConfigResponse>("/auth/me/chatwoot-config");
    return data;
  }

  static async updateChatwootConfig(payload: {
    chatwootAdminToken?: string;
    teamChargeId?: string;
  }): Promise<ChatwootConfigResponse> {
    const { data } = await Api.patch<ChatwootConfigResponse>(
      "/auth/me/chatwoot-config",
      payload,
    );
    return data;
  }

  static async syncChatwootAgents(): Promise<SyncChatwootAgentsResponse> {
    const { data } = await Api.post<SyncChatwootAgentsResponse>(
      "/auth/me/chatwoot-sync-agents",
    );
    return data;
  }

  static async getPromiseAutomation(): Promise<PromiseAutomationResponse> {
    const { data } = await Api.get<PromiseAutomationResponse>(
      "/auth/me/promise-automation",
    );
    return data;
  }

  static async updatePromiseAutomation(
    payload: PromiseAutomationSettings,
  ): Promise<PromiseAutomationResponse> {
    const { data } = await Api.patch<PromiseAutomationResponse>(
      "/auth/me/promise-automation",
      payload,
    );
    return data;
  }
}
