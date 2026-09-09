import { SetMetadata } from '@nestjs/common';

export const PERMITE_SENHA_PROVISORIA = 'permiteSenhaProvisoria';

/**
 * Marca uma rota como acessivel por quem ainda esta com a SENHA INICIAL.
 *
 * O `JwtAuthGuard` barra todo o resto enquanto `mustChangePassword` for `true`.
 * Sem essa excecao o agente ficaria preso: entraria com a senha inicial e nao
 * teria como trocar, porque a propria rota de troca estaria bloqueada.
 *
 * Use com parcimonia — cada rota marcada aqui e uma rota que a senha inicial
 * (a mesma para todos os agentes criados pelo embed) consegue alcancar.
 */
export const PermiteSenhaProvisoria = () =>
  SetMetadata(PERMITE_SENHA_PROVISORIA, true);
