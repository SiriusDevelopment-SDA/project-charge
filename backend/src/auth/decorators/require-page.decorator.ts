import { SetMetadata } from '@nestjs/common';
import type { PaginaId } from '../../companies/planos';

export const REQUIRE_PAGE_KEY = 'requirePage';

/**
 * Exige que a empresa do token tenha a pagina liberada no plano contratado.
 *
 * Sem isso, o gating de produto e apenas visual: o `PermissionRoute` do frontend
 * monta o componente por baixo de um overlay embacado, entao a chamada a API
 * acontece e os dados chegam ao navegador de qualquer forma.
 *
 * Aplique nos handlers que servem dados exclusivos do produto de cobranca.
 * Handler sem este decorator continua liberado — o `PlanGuard` so atua onde a
 * exigencia foi declarada.
 */
export const RequirePage = (pagina: PaginaId) =>
  SetMetadata(REQUIRE_PAGE_KEY, pagina);
