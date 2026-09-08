import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { TokenDeSessao } from '../company-scope';

/**
 * Entrega ao handler o payload do token que o `JwtAuthGuard` ja verificou.
 *
 * Existe para que o controller nao precise ler `authorization` e decodificar o
 * JWT de novo — hoje `SuperAdminGuard`, `PlanGuard` e o proprio `JwtAuthGuard`
 * repetem esse mesmo bloco. Aqui a sessao chega pronta e o handler so decide.
 *
 * Lanca quando nao ha payload: isso so acontece em rota `@Public()`, e rota
 * publica nao pode decidir escopo de empresa por token nenhum.
 */
export const Sessao = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TokenDeSessao => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: TokenDeSessao }>();

    if (!request.user) {
      throw new UnauthorizedException('Sessao invalida.');
    }

    return request.user;
  },
);
