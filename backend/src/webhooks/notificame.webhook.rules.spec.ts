import {
  extrairIdsDeContextoDeCanal,
  extrairIdsDeMensagem,
  extrairTextoDaMensagem,
  montarClausulaDeCanalDaEmpresa,
  montarClausulaDeTelefoneLocal,
  statusIndicaFalha,
  statusIndicaResposta,
  traduzirCodigoDeStatus,
  type NotificaMeWebhookPayload,
} from './notificame.webhook.rules';

/**
 * Rede de seguranca do webhook da NotificaMe.
 *
 * Estas regras viviam dentro do controller e nunca tiveram teste: e por onde
 * entra o status de TODA mensagem disparada e a resposta de todo cliente. Sao
 * decisoes puras — nao precisam de Postgres para serem verificadas, so
 * precisavam estar fora do controller.
 */
describe('regras do webhook da NotificaMe', () => {
  describe('traduzirCodigoDeStatus', () => {
    it('traduz os codigos que o provedor manda', () => {
      expect(traduzirCodigoDeStatus('QUEUED')).toBe('queued');
      expect(traduzirCodigoDeStatus('SENT')).toBe('sent');
      expect(traduzirCodigoDeStatus('DELIVERED')).toBe('delivered');
      expect(traduzirCodigoDeStatus('READ')).toBe('read');
    });

    it('trata REJECTED como erro e UNDELIVERED como falha', () => {
      // Sao dois nomes do provedor para dois desfechos que o relatorio ja
      // distingue: recusa (erro) e nao-entrega (falha).
      expect(traduzirCodigoDeStatus('REJECTED')).toBe('error');
      expect(traduzirCodigoDeStatus('UNDELIVERED')).toBe('failed');
      expect(traduzirCodigoDeStatus('ERROR')).toBe('error');
      expect(traduzirCodigoDeStatus('FAILED')).toBe('failed');
    });

    it('normaliza a caixa do codigo', () => {
      expect(traduzirCodigoDeStatus('delivered')).toBe('delivered');
      expect(traduzirCodigoDeStatus('Sent')).toBe('sent');
    });

    it('devolve null para codigo desconhecido, ausente ou vazio', () => {
      // Sem isto, um codigo novo do provedor gravaria status invalido por cima
      // de um envio real. `null` faz o chamador registrar e ignorar.
      expect(traduzirCodigoDeStatus('CODIGO_NOVO')).toBeNull();
      expect(traduzirCodigoDeStatus(undefined)).toBeNull();
      expect(traduzirCodigoDeStatus(null)).toBeNull();
      expect(traduzirCodigoDeStatus('')).toBeNull();
    });
  });

  describe('statusIndicaResposta / statusIndicaFalha', () => {
    it('so entrega e leitura provam que a mensagem chegou', () => {
      expect(statusIndicaResposta('delivered')).toBe(true);
      expect(statusIndicaResposta('read')).toBe(true);
      expect(statusIndicaResposta('sent')).toBe(false);
      expect(statusIndicaResposta('queued')).toBe(false);
      expect(statusIndicaResposta('failed')).toBe(false);
    });

    it('erro e falha sobem como aviso; o resto e log comum', () => {
      expect(statusIndicaFalha('error')).toBe(true);
      expect(statusIndicaFalha('failed')).toBe(true);
      expect(statusIndicaFalha('delivered')).toBe(false);
    });
  });

  describe('extrairIdsDeMensagem', () => {
    it('prefere o providerMessageId e mantem o messageId como alternativa', () => {
      const body = {
        messageStatus: { providerMessageId: 'prov-1' },
        messageId: 'msg-1',
      } as NotificaMeWebhookPayload;

      expect(extrairIdsDeMensagem(body)).toEqual(['prov-1', 'msg-1']);
    });

    it('descarta vazio e espaco em branco', () => {
      const body = {
        messageStatus: { providerMessageId: '   ' },
        messageId: 'msg-1',
      } as NotificaMeWebhookPayload;

      expect(extrairIdsDeMensagem(body)).toEqual(['msg-1']);
    });

    it('devolve lista vazia quando o evento nao identifica a mensagem', () => {
      // Lista vazia e o sinal de "nao da para casar com relatorio nenhum": sem
      // ela o `IN (:...ids)` iria vazio e a query quebraria.
      expect(extrairIdsDeMensagem({} as NotificaMeWebhookPayload)).toEqual([]);
    });
  });

  describe('extrairIdsDeContextoDeCanal', () => {
    it('junta channel e subscriptionId, sem repetir', () => {
      const body = {
        channel: 'canal-a',
        subscriptionId: 'canal-a',
      } as NotificaMeWebhookPayload;

      expect(extrairIdsDeContextoDeCanal(body)).toEqual(['canal-a']);
    });

    it('devolve os dois quando sao diferentes', () => {
      const body = {
        channel: 'canal-a',
        subscriptionId: 'sub-b',
      } as NotificaMeWebhookPayload;

      expect(extrairIdsDeContextoDeCanal(body)).toEqual(['canal-a', 'sub-b']);
    });

    it('devolve vazio sem contexto nenhum', () => {
      // O chamador PRECISA parar aqui: telefone sozinho casaria com o
      // relatorio de qualquer empresa que ja falou com aquele numero.
      expect(extrairIdsDeContextoDeCanal({} as NotificaMeWebhookPayload)).toEqual(
        [],
      );
    });
  });

  describe('montarClausulaDeTelefoneLocal', () => {
    it('forca no-match para telefone curto demais', () => {
      // `1 = 0` e proposital: sem DDD + assinante (10 digitos) qualquer
      // comparacao por sufixo casaria numeros de clientes diferentes.
      expect(montarClausulaDeTelefoneLocal('99998888').clause).toBe('1 = 0');
      expect(montarClausulaDeTelefoneLocal('').clause).toBe('1 = 0');
      expect(montarClausulaDeTelefoneLocal('99998888').params).toEqual({});
    });

    it('compara por sufixo e exige 10 digitos quando o telefone e valido', () => {
      const { clause, params } = montarClausulaDeTelefoneLocal('11998950080');

      expect(params).toEqual({ localFrom: '11998950080' });
      expect(clause).toContain('>= 10');
      expect(clause).toContain('RIGHT(');
      expect(clause).toContain(':localFrom');
    });

    it('remove o 55 inicial da coluna so quando o numero tem pais', () => {
      // O worker grava `relatory.number` sem 55 e o webhook chega com 55; sem
      // este recorte a resposta do cliente nunca casaria com o disparo.
      const { clause } = montarClausulaDeTelefoneLocal('11998950080');

      expect(clause).toContain("LEFT(regexp_replace(relatory.number");
      expect(clause).toContain("= '55'");
      expect(clause).toContain('>= 12');
    });
  });

  describe('montarClausulaDeCanalDaEmpresa', () => {
    it('usa containment jsonb por id de canal', () => {
      const { clause, params } = montarClausulaDeCanalDaEmpresa(['canal-a']);

      expect(clause).toContain('canalId_notificameHub');
      expect(clause).toContain('@>');
      expect(params).toEqual({ channelCtx0: 'canal-a' });
    });

    it('liga varios canais por OR, um parametro para cada', () => {
      const { clause, params } = montarClausulaDeCanalDaEmpresa([
        'canal-a',
        'sub-b',
      ]);

      expect(clause).toContain(' OR ');
      expect(params).toEqual({ channelCtx0: 'canal-a', channelCtx1: 'sub-b' });
    });

    it('forca no-match sem canal nenhum', () => {
      // Barreira de multi-tenant: sem canal, NENHUMA empresa pode casar.
      expect(montarClausulaDeCanalDaEmpresa([]).clause).toBe('1 = 0');
      expect(montarClausulaDeCanalDaEmpresa([]).params).toEqual({});
    });
  });

  describe('extrairTextoDaMensagem', () => {
    it('pega o primeiro conteudo de texto', () => {
      const texto = extrairTextoDaMensagem({
        contents: [
          { type: 'image' },
          { type: 'text', text: 'ja paguei' },
          { type: 'text', text: 'segundo' },
        ],
      });

      expect(texto).toBe('ja paguei');
    });

    it('devolve null quando so ha midia, quando a lista some ou quando nao ha mensagem', () => {
      expect(extrairTextoDaMensagem({ contents: [{ type: 'image' }] })).toBeNull();
      expect(extrairTextoDaMensagem({})).toBeNull();
      expect(extrairTextoDaMensagem(undefined)).toBeNull();
    });
  });
});
