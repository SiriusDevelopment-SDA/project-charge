import { classifyErpFailure } from './erp-failure';

/**
 * A classificacao decide se uma campanha continua pendente ou se e concluida.
 *
 * O erro que motivou este codigo: ERP fora do ar no horario da campanha virava
 * lista vazia de faturas, indistinguivel de "todos os clientes quitaram", e a
 * campanha se marcava como executada. Cada mensagem abaixo e a que o adapter do
 * ERP correspondente realmente levanta — se algum deles mudar o formato, e aqui
 * que precisa quebrar, e nao em producao com a campanha perdida.
 */
describe('classifyErpFailure', () => {
  describe('transitorio — vale a pena tentar de novo', () => {
    it('trata falha de rede do fetch como ERP inacessivel', () => {
      const falha = classifyErpFailure(new TypeError('fetch failed'));

      expect(falha).toMatchObject({ cause: 'inacessivel', transient: true });
    });

    it('trata timeout do AbortSignal como ERP inacessivel', () => {
      const erro = new Error('The operation was aborted due to timeout');
      erro.name = 'TimeoutError';

      expect(classifyErpFailure(erro)).toMatchObject({
        cause: 'inacessivel',
        transient: true,
      });
    });

    it('trata DNS e conexao recusada como ERP inacessivel', () => {
      expect(classifyErpFailure(new Error('getaddrinfo ENOTFOUND erp.exemplo'))).toMatchObject({
        transient: true,
      });
      expect(classifyErpFailure(new Error('connect ECONNREFUSED 10.0.0.1:443'))).toMatchObject({
        transient: true,
      });
    });

    it('trata a falha de rede que o MK monta', () => {
      const falha = classifyErpFailure(
        new Error('[MK] faturas abertas — falha de rede ao acessar https://erp/mk/WS.rule'),
      );

      expect(falha).toMatchObject({ cause: 'inacessivel', transient: true });
    });

    it('trata a falha de rede que a Gama ISP monta', () => {
      const falha = classifyErpFailure(
        new Error('[GAMAISP] faturas por documento: falha de rede ao acessar erp.exemplo -> fetch failed'),
      );

      expect(falha).toMatchObject({ cause: 'inacessivel', transient: true });
    });

    it('trata 5xx do IXC/SGP/HUBSOFT como transitorio', () => {
      const falha = classifyErpFailure(
        new Error('Erro no ERP (IXC): 502 -> Bad Gateway'),
      );

      expect(falha).toMatchObject({
        cause: 'inacessivel',
        transient: true,
        httpStatus: 502,
      });
    });

    it('trata 500 do MK como transitorio', () => {
      expect(
        classifyErpFailure(new Error('[MK] faturas abertas erro 500: internal error')),
      ).toMatchObject({ transient: true, httpStatus: 500 });
    });

    it('trata 429 como transitorio — o ERP esta vivo mas nao atende agora', () => {
      expect(
        classifyErpFailure(new Error('Erro no ERP (SGP): 429 -> too many requests')),
      ).toMatchObject({ transient: true, httpStatus: 429 });
    });

    it('trata o fatal error do PHP da Gama ISP (HTTP 200 com HTML) como transitorio', () => {
      const falha = classifyErpFailure(
        new Error(
          '[GAMAISP] faturas por documento: resposta HTTP 200 nao e JSON (provavel fatal error do PHP) -> Fatal error: Allowed memory size exhausted',
        ),
      );

      expect(falha).toMatchObject({ cause: 'inacessivel', transient: true });
    });

    it('trata o SyntaxError do response.json() do IXC/SGP como transitorio', () => {
      const falha = classifyErpFailure(
        new SyntaxError(`Unexpected token '<', "<html>" is not valid JSON`),
      );

      expect(falha).toMatchObject({ cause: 'inacessivel', transient: true });
    });
  });

  describe('permanente — repetir so geraria ruido', () => {
    it('classifica 401 como credencial', () => {
      const falha = classifyErpFailure(
        new Error('Erro no ERP (HUBSOFT): 401 -> Unauthorized'),
      );

      expect(falha).toMatchObject({
        cause: 'credencial',
        transient: false,
        httpStatus: 401,
      });
    });

    it('classifica 403 como credencial', () => {
      expect(
        classifyErpFailure(new Error('[GAMAISP] autenticacao: HTTP 403 -> forbidden')),
      ).toMatchObject({ cause: 'credencial', transient: false });
    });

    it('classifica 404 como configuracao', () => {
      expect(
        classifyErpFailure(new Error('Erro no ERP (IXC): 404 -> Not Found')),
      ).toMatchObject({ cause: 'configuracao', transient: false, httpStatus: 404 });
    });

    it('classifica falha de autenticacao apos renovar o token do MK como credencial', () => {
      // O MK ja renovou o token e tentou de novo antes de levantar isso.
      expect(
        classifyErpFailure(
          new Error('[MK] faturas abertas: falha de autenticação após renovar o token de sessão'),
        ),
      ).toMatchObject({ transient: false });
    });

    it('NAO retenta problema de dado de um cliente so', () => {
      // Se isto segurasse a campanha, um unico cadastro torto adiaria o disparo
      // de todo mundo — pior que o defeito original.
      const falha = classifyErpFailure(
        new Error('[GAMAISP] Cliente sem CPF/CNPJ — a Gama ISP so consulta faturas por documento'),
      );

      expect(falha).toMatchObject({ cause: 'configuracao', transient: false });
    });

    it('classifica credencial ausente como configuracao', () => {
      expect(
        classifyErpFailure(
          new Error('Credenciais da SGP não configuradas (username/password)'),
        ),
      ).toMatchObject({ cause: 'configuracao', transient: false });
    });
  });

  it('resume a mensagem para caber no relatorio', () => {
    const falha = classifyErpFailure(new Error('x'.repeat(1000)));

    expect(falha.message).toHaveLength(300);
  });

  it('nao quebra com erro que nao e Error', () => {
    expect(classifyErpFailure('deu ruim')).toMatchObject({
      cause: 'configuracao',
      transient: false,
      message: 'deu ruim',
    });
    expect(classifyErpFailure(undefined)).toMatchObject({ transient: false });
  });
});
