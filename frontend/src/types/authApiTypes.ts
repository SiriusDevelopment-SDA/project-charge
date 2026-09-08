/**
 * Tipos do contrato de autenticacao com o backend.
 *
 * Fonte unica de verdade para respostas de login / switch-company / me.
 * Mantenha alinhado com os DTOs em `backend/src/auth/`.
 */

export type AgentRole = "admin" | "operator" | "super_admin";

/**
 * Canal NotificaMe (caixa de disparo) da empresa, como o `GET /auth/me`
 * devolve.
 *
 * Tres arquivos ja importavam este tipo daqui — `ChannelSelect`,
 * `useNotificameChannels` e o `MeResponse` do `auth.service` — e ele nunca
 * foi declarado. O `tsc` acusava, mas o `vite build` usa esbuild, que apaga
 * anotacao de tipo sem conferir: o build passava e a anotacao nao valia nada.
 *
 * A forma vem do backend (`auth.service.ts`, `toPublicChannels`), que filtra
 * entrada sem `id` e forca `numero` a string — vazia quando ausente, nunca
 * indefinida. O X-Api-Token vive noutra coluna e NAO compoe este retorno.
 */
export type NotificameChannel = {
  id: string;
  numero: string;
};

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
