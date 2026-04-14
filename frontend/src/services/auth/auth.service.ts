import { Api } from "../api";
import { getErrorStatus } from "../../utils/error";

type LoginPayload = {
  email: string;
  password: string;
};

type EmbedLoginPayload = {
  account: string;
  token: string;
};

export type PagePermissions = {
  dashboard: boolean;
  clientesVencidos: boolean;
  chat: boolean;
};

type LoginResponse = {
  success: boolean;
  accessToken: string;
  company: {
    id: string;
    name: string;
    account: string;
    active: boolean;
  };
  permissions?: PagePermissions | null;
  agent?: {
    id: string;
    name: string | null;
    email: string | null;
    role: "admin" | "operator";
    active: boolean;
  } | null;
};

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
  permissions?: PagePermissions | null;
  agent?: {
    id: string;
    name: string | null;
    email: string | null;
    role: "admin" | "operator";
    active: boolean;
  } | null;
};

export type CompanyAgent = {
  id: string;
  name: string | null;
  email: string | null;
  role: "admin" | "operator";
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
  role: "admin" | "operator";
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
    role: "admin" | "operator";
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
    role?: "admin" | "operator";
  };
};

type ManageAgentResponse = {
  success: boolean;
  message: string;
  agent: {
    id: string;
    name: string | null;
    email: string | null;
    role: "admin" | "operator";
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
      role?: "admin" | "operator";
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
