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
  /** Nome do atendente usado nos templates de disparo — pode ser sobrescrito manualmente */
  ATTENDANT_NAME: "attendant_name",
  /** Nome da empresa sobrescrito para disparo — fallback para COMPANY_NAME */
  DISPATCH_COMPANY_NAME: "dispatch_company_name",
  /** CNPJ da empresa autenticada — usado como chave PIX no ORDER_DETAILS */
  COMPANY_CNPJ: "company_cnpj",
  /** Status de ativação da empresa no sistema de cobrança */
  COMPANY_ACTIVE: "company_active",
} as const;

type AuthMode = "agent" | "embed";

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

  // --- Session ---
  /** Remove todos os dados de sessão (logout) */
  clearSession: () => {
    remove(KEYS.ACCESS_TOKEN);
    remove(KEYS.ACCOUNT);
    remove(KEYS.EMBED_SIGNATURE);
    remove(KEYS.AUTH_MODE);
    remove(KEYS.AGENT_NAME);
    remove(KEYS.ATTENDANT_NAME);
    remove(KEYS.DISPATCH_COMPANY_NAME);
    remove(KEYS.COMPANY_NAME);
    remove(KEYS.COMPANY_CNPJ);
    remove(KEYS.COMPANY_ACTIVE);
  },

  /** Remove dados de sessão + atendente ao fazer login limpo */
  clearOnLogin: () => {
    remove(KEYS.ATTENDANT_NAME);
    remove(KEYS.EMBED_SIGNATURE);
    remove(KEYS.AGENT_NAME);
  },
} as const;
