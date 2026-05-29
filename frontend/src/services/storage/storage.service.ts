/**
 * Ponto único de acesso ao localStorage.
 * Todas as chaves estão definidas aqui — nunca use strings literais fora deste arquivo.
 */

const KEYS = {
  ACCESS_TOKEN: "access_token",
  ACCOUNT: "account",
  COMPANY_NAME: "company_name",
  EMBED_SIGNATURE: "embed_signature",
  AUTH_MODE: "auth_mode",
  /** Nome do agente autenticado — vem do backend no login */
  AGENT_NAME: "agent_name",
  /** Papel do agente autenticado — vem do backend no login */
  AGENT_ROLE: "agent_role",
  /** Nome do atendente usado nos templates de disparo — pode ser sobrescrito manualmente */
  ATTENDANT_NAME: "attendant_name",
  /** Nome da empresa sobrescrito para disparo — fallback para COMPANY_NAME */
  DISPATCH_COMPANY_NAME: "dispatch_company_name",
  /** CNPJ da empresa autenticada — usado como chave PIX no ORDER_DETAILS */
  COMPANY_CNPJ: "company_cnpj",
  /** Status de ativação da empresa no sistema de cobrança */
  COMPANY_ACTIVE: "company_active",
  /** Permissões de páginas da empresa — JSON serializado */
  PAGE_PERMISSIONS: "page_permissions",
  /** Última empresa ativa em sessões de super_admin — usado para restaurar contexto */
  LAST_ACTIVE_COMPANY_ID: "last_active_company_id",
  /** Id da empresa autenticada na sessão atual — preenchido em `applyLoginSession` */
  COMPANY_ID: "company_id",
} as const;

type AuthMode = "agent" | "embed";
type StoredAgentRole = "admin" | "operator" | "super_admin";

function get(key: string): string {
  if (typeof window === "undefined") return "";
  return (localStorage.getItem(key) ?? "").trim();
}

function set(key: string, value: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, value.trim());
}

function remove(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key);
}

export const AppStorage = {
  // --- Auth ---
  getAccessToken: () => get(KEYS.ACCESS_TOKEN),
  setAccessToken: (token: string) => set(KEYS.ACCESS_TOKEN, token),
  removeAccessToken: () => remove(KEYS.ACCESS_TOKEN),

  getAccount: () => get(KEYS.ACCOUNT),
  setAccount: (account: string) => set(KEYS.ACCOUNT, account),
  removeAccount: () => remove(KEYS.ACCOUNT),

  getCompanyName: () => get(KEYS.COMPANY_NAME),
  setCompanyName: (name: string) => set(KEYS.COMPANY_NAME, name),

  getCompanyId: () => get(KEYS.COMPANY_ID),
  setCompanyId: (id: string) => set(KEYS.COMPANY_ID, id),
  removeCompanyId: () => remove(KEYS.COMPANY_ID),

  getEmbedSignature: () => get(KEYS.EMBED_SIGNATURE),
  setEmbedSignature: (sig: string) => set(KEYS.EMBED_SIGNATURE, sig),
  removeEmbedSignature: () => remove(KEYS.EMBED_SIGNATURE),

  getAuthMode: (): AuthMode => {
    const value = get(KEYS.AUTH_MODE);
    return value === "agent" ? "agent" : "embed";
  },
  setAuthMode: (mode: AuthMode) => set(KEYS.AUTH_MODE, mode),

  // --- Agente autenticado ---
  getAgentName: () => get(KEYS.AGENT_NAME),
  setAgentName: (name: string) => set(KEYS.AGENT_NAME, name),
  removeAgentName: () => remove(KEYS.AGENT_NAME),

  getAgentRole: (): StoredAgentRole | null => {
    const value = get(KEYS.AGENT_ROLE);
    if (value === "admin" || value === "operator" || value === "super_admin") {
      return value;
    }
    return null;
  },
  setAgentRole: (role: StoredAgentRole) => set(KEYS.AGENT_ROLE, role),
  removeAgentRole: () => remove(KEYS.AGENT_ROLE),

  // --- Super admin / ultima empresa ativa ---
  getLastActiveCompanyId: () => get(KEYS.LAST_ACTIVE_COMPANY_ID),
  setLastActiveCompanyId: (id: string) => set(KEYS.LAST_ACTIVE_COMPANY_ID, id),
  removeLastActiveCompanyId: () => remove(KEYS.LAST_ACTIVE_COMPANY_ID),

  // --- Disparo ---
  /**
   * Retorna o nome do atendente para uso nos templates.
   * Prioridade: attendant_name (manual) → agent_name (do login)
   */
  getAttendantName: () =>
    get(KEYS.ATTENDANT_NAME) || get(KEYS.AGENT_NAME),
  setAttendantName: (name: string) => set(KEYS.ATTENDANT_NAME, name),
  removeAttendantName: () => remove(KEYS.ATTENDANT_NAME),

  /**
   * Retorna o nome da empresa para uso nos templates.
   * Prioridade: dispatch_company_name (sobrescrito) → company_name (do login)
   */
  getDispatchCompanyName: () =>
    get(KEYS.DISPATCH_COMPANY_NAME) || get(KEYS.COMPANY_NAME),
  setDispatchCompanyName: (name: string) =>
    set(KEYS.DISPATCH_COMPANY_NAME, name),

  getCompanyCnpj: () => get(KEYS.COMPANY_CNPJ),
  setCompanyCnpj: (cnpj: string) => set(KEYS.COMPANY_CNPJ, cnpj),

  getCompanyActive: (): boolean => get(KEYS.COMPANY_ACTIVE) !== "false",
  setCompanyActive: (active: boolean) => set(KEYS.COMPANY_ACTIVE, String(active)),

  getPagePermissions: (): { dashboard: boolean; clientesVencidos: boolean; chat: boolean } => {
    try {
      const raw = get(KEYS.PAGE_PERMISSIONS);
      if (!raw) return { dashboard: true, clientesVencidos: true, chat: true };
      const parsed = JSON.parse(raw);
      return {
        dashboard: parsed.dashboard !== false,
        clientesVencidos: parsed.clientesVencidos !== false,
        chat: parsed.chat !== false,
      };
    } catch {
      return { dashboard: true, clientesVencidos: true, chat: true };
    }
  },
  setPagePermissions: (perms: { dashboard: boolean; clientesVencidos: boolean; chat: boolean }) =>
    set(KEYS.PAGE_PERMISSIONS, JSON.stringify(perms)),

  // --- Session ---
  /** Remove todos os dados de sessão (logout) */
  clearSession: () => {
    remove(KEYS.ACCESS_TOKEN);
    remove(KEYS.ACCOUNT);
    remove(KEYS.EMBED_SIGNATURE);
    remove(KEYS.AUTH_MODE);
    remove(KEYS.AGENT_NAME);
    remove(KEYS.AGENT_ROLE);
    remove(KEYS.ATTENDANT_NAME);
    remove(KEYS.DISPATCH_COMPANY_NAME);
    remove(KEYS.COMPANY_NAME);
    remove(KEYS.COMPANY_ID);
    remove(KEYS.COMPANY_CNPJ);
    remove(KEYS.COMPANY_ACTIVE);
    remove(KEYS.PAGE_PERMISSIONS);
    // LAST_ACTIVE_COMPANY_ID NAO e removido no logout de proposito:
    // o super_admin deve retornar a ultima empresa selecionada no proximo login.
    // So e limpo em fallback de switch invalido (404) ou clear total do cache.
  },

  /** Remove dados de sessão + atendente ao fazer login limpo */
  clearOnLogin: () => {
    remove(KEYS.ATTENDANT_NAME);
    remove(KEYS.EMBED_SIGNATURE);
    remove(KEYS.AGENT_NAME);
    remove(KEYS.AGENT_ROLE);
  },
} as const;
