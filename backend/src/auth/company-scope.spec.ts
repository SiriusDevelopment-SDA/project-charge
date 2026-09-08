import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import {
  descreverAcessoCruzado,
  resolverAccountDaRequisicao,
  resolverCompanyIdDaRequisicao,
  type TokenDeSessao,
} from './company-scope';

const EMPRESA_A = '11111111-1111-4111-8111-111111111111';
const EMPRESA_B = '22222222-2222-4222-8222-222222222222';

const operador = (over: Partial<TokenDeSessao> = {}): TokenDeSessao => ({
  sub: EMPRESA_A,
  account: '900',
  agentId: 'agente-1',
  agentRole: 'operator',
  ...over,
});

const superAdmin = (over: Partial<TokenDeSessao> = {}): TokenDeSessao =>
  operador({ agentRole: 'super_admin', agentId: 'suporte-1', ...over });

describe('escopo de empresa nas rotas de faturas', () => {
  describe('resolverCompanyIdDaRequisicao', () => {
    it('usa a empresa do token quando o corpo nao manda companyId', () => {
      const escopo = resolverCompanyIdDaRequisicao(operador(), undefined);

      expect(escopo).toEqual({ valor: EMPRESA_A, cruzouEmpresa: false });
    });

    it('aceita quando o corpo repete a empresa do token', () => {
      const escopo = resolverCompanyIdDaRequisicao(operador(), EMPRESA_A);

      expect(escopo).toEqual({ valor: EMPRESA_A, cruzouEmpresa: false });
    });

    it('nao reprova por caixa ou espaco no uuid', () => {
      // 403 em usuario legitimo por causa de maiuscula seria pior que o
      // problema que esta funcao resolve.
      const escopo = resolverCompanyIdDaRequisicao(
        operador(),
        `  ${EMPRESA_A.toUpperCase()}  `,
      );

      expect(escopo.valor).toBe(EMPRESA_A);
      expect(escopo.cruzouEmpresa).toBe(false);
    });

    it('RECUSA com 403 quando o corpo pede outra empresa', () => {
      // O buraco que o B1 fecha: ate aqui, trocar o id no corpo lia a carteira
      // de outra empresa.
      expect(() =>
        resolverCompanyIdDaRequisicao(operador(), EMPRESA_B),
      ).toThrow(ForbiddenException);
    });

    it('recusa admin comum tambem — nao e questao de ser admin', () => {
      expect(() =>
        resolverCompanyIdDaRequisicao(operador({ agentRole: 'admin' }), EMPRESA_B),
      ).toThrow(ForbiddenException);
    });

    it('deixa super_admin atravessar, e marca a travessia', () => {
      const escopo = resolverCompanyIdDaRequisicao(superAdmin(), EMPRESA_B);

      expect(escopo.valor).toBe(EMPRESA_B);
      expect(escopo.cruzouEmpresa).toBe(true);
    });

    it('super_admin na propria empresa nao conta como travessia', () => {
      // Sem isto, todo acesso do suporte viraria linha de auditoria e o log
      // que importa se perderia no meio.
      const escopo = resolverCompanyIdDaRequisicao(superAdmin(), EMPRESA_A);

      expect(escopo.cruzouEmpresa).toBe(false);
    });

    it('recusa a sessao quando o token nao tem sub', () => {
      // Cair para o corpo aqui reabriria exatamente o buraco.
      expect(() =>
        resolverCompanyIdDaRequisicao({ agentRole: 'operator' }, EMPRESA_B),
      ).toThrow(UnauthorizedException);
    });

    it('recusa a sessao mesmo para super_admin sem sub', () => {
      expect(() =>
        resolverCompanyIdDaRequisicao({ agentRole: 'super_admin' }, EMPRESA_B),
      ).toThrow(UnauthorizedException);
    });
  });

  describe('resolverAccountDaRequisicao', () => {
    it('usa o account do token quando o corpo nao manda', () => {
      expect(resolverAccountDaRequisicao(operador(), '')).toEqual({
        valor: '900',
        cruzouEmpresa: false,
      });
    });

    it('RECUSA com 403 quando o corpo pede outro account', () => {
      expect(() => resolverAccountDaRequisicao(operador(), '901')).toThrow(
        ForbiddenException,
      );
    });

    it('deixa super_admin atravessar por account tambem', () => {
      const escopo = resolverAccountDaRequisicao(superAdmin(), '901');

      expect(escopo).toEqual({ valor: '901', cruzouEmpresa: true });
    });

    it('recusa a sessao quando o token nao tem account', () => {
      expect(() =>
        resolverAccountDaRequisicao({ sub: EMPRESA_A }, '901'),
      ).toThrow(UnauthorizedException);
    });
  });

  describe('descreverAcessoCruzado', () => {
    // A linha vai em `chave=valor` porque ferramenta de log filtra campo, nao
    // prosa: acesso entre empresas e exatamente o evento que alguem vai querer
    // alertar depois.
    it('leva quem, papel, rota e as duas empresas, em chave=valor', () => {
      const linha = descreverAcessoCruzado(
        superAdmin(),
        { valor: EMPRESA_B, cruzouEmpresa: true },
        'POST /invoices/search',
      );

      expect(linha).toContain('agentId=suporte-1');
      expect(linha).toContain('role=super_admin');
      expect(linha).toContain('rota=POST /invoices/search');
      expect(linha).toContain(`empresaDoToken=${EMPRESA_A}`);
      expect(linha).toContain(`empresaAcessada=${EMPRESA_B}`);
    });
  });
});
