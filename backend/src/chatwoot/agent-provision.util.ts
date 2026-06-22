import type { AgentRole } from '../agents/entities/agent.entity';

export type ChatwootAgentRole = 'administrator' | 'agent';

/**
 * Mapeia o papel interno do agente (project-charge) para o papel aceito pela
 * API de conta do Chatwoot ao criar um agente via `POST /agents`.
 *
 * Regra de negócio: `admin` e `super_admin` viram `administrator` no Chatwoot;
 * qualquer outro papel (ex.: `operator`) vira `agent`.
 */
export function mapChatwootAgentRole(role: AgentRole): ChatwootAgentRole {
  return role === 'admin' || role === 'super_admin' ? 'administrator' : 'agent';
}
