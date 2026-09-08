import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { AgentRole } from '../agents/entities/agent.entity';

/**
 * De quem sao os dados que esta requisicao pode ler.
 *
 * Ate aqui as rotas de faturas confiavam no CORPO da requisicao para dizer de
 * qual empresa eram os dados: `companyId` em `/invoices/search` e
 * `/invoices/pix/batch`, `account` em `/invoices/overdue-clients/search`.
 * Autenticar so respondia "e um usuario valido?" — nao "e um usuario DESTA
 * empresa?". Trocar o id no corpo lia a carteira de outra.
 *
 * A fonte da verdade passa a ser o token: `sub` e o companyId e `account` e a
 * conta da empresa da sessao. O corpo continua podendo mandar o campo (o
 * frontend manda), mas ele so vale se casar com o token.
 *
 * A regra vive fora do controller de proposito: e decisao, nao I/O, e assim da
 * para prova-la sem banco e sem HTTP.
 */

export type TokenDeSessao = {
  sub?: string;
  account?: string;
  agentId?: string;
  agentRole?: AgentRole;
};

export type EscopoResolvido = {
  /** O valor que a consulta deve usar. Nunca vem do corpo sem conferencia. */
  valor: string;
  /**
   * `true` quando um `super_admin` acessou empresa diferente da do token.
   * Quem chama registra — acesso entre empresas nao pode ser silencioso.
   */
  cruzouEmpresa: boolean;
};

/**
 * Compara ignorando espacos e caixa.
 *
 * UUID pode chegar em maiuscula de um cliente e minuscula de outro; reprovar
 * por isso seria 403 em usuario legitimo, que e pior do que o problema.
 */
function mesmoValor(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function resolver(params: {
  doToken: string | undefined;
  pedido: string | null | undefined;
  ehSuperAdmin: boolean;
  rotulo: 'companyId' | 'account';
}): EscopoResolvido {
  const { doToken, pedido, ehSuperAdmin, rotulo } = params;

  const donoDaSessao = String(doToken ?? '').trim();
  if (!donoDaSessao) {
    // Token sem `sub`/`account` nao identifica empresa. Cair para o corpo aqui
    // seria reabrir exatamente o buraco que esta funcao fecha.
    throw new UnauthorizedException('Sessao invalida.');
  }

  const solicitado = String(pedido ?? '').trim();

  // Corpo sem o campo: a empresa da sessao, que e o caso normal.
  if (!solicitado) {
    return { valor: donoDaSessao, cruzouEmpresa: false };
  }

  if (mesmoValor(solicitado, donoDaSessao)) {
    return { valor: donoDaSessao, cruzouEmpresa: false };
  }

  if (!ehSuperAdmin) {
    // 403 e nao 404: o recurso existe, quem pediu e que nao pode. Devolver 404
    // esconderia o erro de escopo do proprio time e viraria "sumiu a fatura"
    // no suporte.
    throw new ForbiddenException(
      `Sessao nao autorizada para o ${rotulo} informado.`,
    );
  }

  // `super_admin` atravessa empresas por desenho — e o perfil que opera e da
  // suporte a base inteira. O acesso e permitido e REGISTRADO por quem chama.
  return { valor: solicitado, cruzouEmpresa: true };
}

/** Resolve o `companyId` que a consulta deve usar, a partir do `sub` do token. */
export function resolverCompanyIdDaRequisicao(
  token: TokenDeSessao,
  companyIdPedido: string | null | undefined,
): EscopoResolvido {
  return resolver({
    doToken: token.sub,
    pedido: companyIdPedido,
    ehSuperAdmin: token.agentRole === 'super_admin',
    rotulo: 'companyId',
  });
}

/** Resolve o `account` que a consulta deve usar, a partir do token. */
export function resolverAccountDaRequisicao(
  token: TokenDeSessao,
  accountPedido: string | null | undefined,
): EscopoResolvido {
  return resolver({
    doToken: token.account,
    pedido: accountPedido,
    ehSuperAdmin: token.agentRole === 'super_admin',
    rotulo: 'account',
  });
}

/**
 * `super_admin` enxerga a base inteira.
 *
 * Existe porque nem toda consulta recebe um alvo: `/invoices/search` por
 * documento nao diz de que empresa e o CPF. Para todo mundo, a busca passa a
 * ser filtrada pela empresa da sessao; para o suporte, continua global — que e
 * a decisao registrada, e o motivo de o perfil existir.
 */
export function enxergaTodasAsEmpresas(token: TokenDeSessao): boolean {
  return token.agentRole === 'super_admin';
}

/**
 * Linha unica de auditoria para acesso entre empresas.
 *
 * Todo campo vai como `chave=valor`, inclusive a rota: acesso entre empresas e
 * o tipo de evento que alguem vai querer alertar ou consultar depois, e
 * ferramenta de log filtra campo, nao prosa.
 */
export function descreverAcessoCruzado(
  token: TokenDeSessao,
  escopo: EscopoResolvido,
  rota: string,
): string {
  const campos = [
    `agentId=${token.agentId ?? '-'}`,
    `role=${token.agentRole ?? '-'}`,
    `rota=${rota}`,
    `empresaDoToken=${token.sub ?? '-'}`,
    `empresaAcessada=${escopo.valor}`,
  ];

  return `[EscopoDeEmpresa] acesso entre empresas ${campos.join(' ')}`;
}
