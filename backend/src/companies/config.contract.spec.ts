import {
  CHAVES_PAGAMENTO,
  chavesConhecidas,
  chavesDesconhecidas,
  ehTipoChavePix,
  montarConfig,
  resolverChavePix,
} from './config.contract';

/**
 * A chave PIX no contrato de config.
 *
 * Antes desta mudanca `order_pix_key` NAO existia no contrato: nao havia como
 * configura-la pelo cadastro e, pior, um `UPDATE` manual que a gravasse seria
 * DESCARTADO no primeiro PATCH que a empresa recebesse — em silencio, do jeito
 * que o contrato descarta tudo que nao reconhece. O botao ORDER_DETAILS ficava
 * sem `key`/`key_type` e a Meta recusava o disparo depois do `queued`.
 *
 * O ERP usado aqui e o IXC por ser o de credencial mais simples (`autorization`
 * vai para coluna propria, nao para o config): assim os testes falam so das
 * chaves de pagamento, sem credencial no meio.
 */
const ERP = 'IXC';

describe('contrato: chaves de pagamento', () => {
  it('reconhece order_pix_key e order_pix_key_type', () => {
    const conhecidas = chavesConhecidas(ERP);
    for (const chave of CHAVES_PAGAMENTO) {
      expect(conhecidas.has(chave)).toBe(true);
    }
  });

  it('NAO trata mais a chave gravada a mao como chave desconhecida', () => {
    expect(
      chavesDesconhecidas(
        { order_pix_key: '11222333000181', order_pix_key_type: 'CNPJ' },
        ERP,
      ),
    ).toEqual([]);
  });

  it('preserva a chave ja gravada num PATCH que nao fala de pagamento', () => {
    const { config } = montarConfig(
      { order_pix_key: 'chave@provedor.com.br', order_pix_key_type: 'EMAIL' },
      { plano: 'cobranca' },
      ERP,
    );

    expect(config.order_pix_key).toBe('chave@provedor.com.br');
    expect(config.order_pix_key_type).toBe('EMAIL');
  });
});

describe('montarConfig — pagamento', () => {
  it('grava a chave e o tipo, normalizando o tipo para maiusculas', () => {
    const { config } = montarConfig(
      {},
      { pagamento: { order_pix_key: ' 5511999999999 ', order_pix_key_type: 'phone' } },
      ERP,
    );

    expect(config.order_pix_key).toBe('5511999999999');
    expect(config.order_pix_key_type).toBe('PHONE');
  });

  it('altera so o campo enviado', () => {
    const { config } = montarConfig(
      { order_pix_key: 'antiga', order_pix_key_type: 'EVP' },
      { pagamento: { order_pix_key_type: 'CPF' } },
      ERP,
    );

    expect(config.order_pix_key).toBe('antiga');
    expect(config.order_pix_key_type).toBe('CPF');
  });

  /**
   * OS DOIS TESTES DE LIMPEZA ABAIXO SAO DE CONTRATO DA FUNCAO, NAO DA API.
   *
   * `montarConfig` continua sabendo remover as duas chaves de forma coerente, e
   * isso e proposital. O que mudou foi o DTO: `PagamentoPixDto` passou a usar
   * `@TextoOpcional()`, entao um `''` vindo do HTTP vira `undefined` e nunca
   * chega aqui — apagar a chave de recebimento por causa de um vazio que veio
   * de carona mandaria a cobranca para o lugar errado, com 200 na resposta.
   *
   * Ou seja: hoje nenhum endpoint produz este caso. Ele fica testado porque um
   * caminho explicito para desfazer a sobreposicao, se um dia existir, deve
   * reusar esta funcao em vez de reinventar a remocao pela metade — deixando um
   * tipo orfao apontando para uma chave que nao existe mais.
   */
  it('limpar a chave leva o tipo junto — tipo orfao nao configura nada', () => {
    const { config } = montarConfig(
      { order_pix_key: 'antiga', order_pix_key_type: 'EVP' },
      { pagamento: { order_pix_key: '' } },
      ERP,
    );

    expect(config.order_pix_key).toBeUndefined();
    expect(config.order_pix_key_type).toBeUndefined();
  });

  it('limpar a chave vence, mesmo com um tipo novo na MESMA chamada', () => {
    const { config } = montarConfig(
      { order_pix_key: 'antiga', order_pix_key_type: 'EVP' },
      { pagamento: { order_pix_key: '', order_pix_key_type: 'CPF' } },
      ERP,
    );

    expect(config.order_pix_key).toBeUndefined();
    expect(config.order_pix_key_type).toBeUndefined();
  });

  it('nao toca em nada quando `pagamento` nao e enviado', () => {
    const { config } = montarConfig(
      { order_pix_key: 'antiga', order_pix_key_type: 'EVP' },
      {},
      ERP,
    );

    expect(config.order_pix_key).toBe('antiga');
    expect(config.order_pix_key_type).toBe('EVP');
  });
});

describe('ehTipoChavePix', () => {
  it('aceita exatamente os cinco tipos da Meta', () => {
    for (const tipo of ['CNPJ', 'CPF', 'EMAIL', 'PHONE', 'EVP']) {
      expect(ehTipoChavePix(tipo)).toBe(true);
    }
  });

  it('recusa RANDOM — a chave aleatoria e EVP para a Meta', () => {
    expect(ehTipoChavePix('RANDOM')).toBe(false);
  });

  it('recusa minuscula, vazio e nao-string (a normalizacao e de quem chama)', () => {
    expect(ehTipoChavePix('cnpj')).toBe(false);
    expect(ehTipoChavePix('')).toBe(false);
    expect(ehTipoChavePix(undefined)).toBe(false);
    expect(ehTipoChavePix(null)).toBe(false);
  });
});

/**
 * `resolverChavePix` e a FONTE UNICA dos dois construtores de
 * `pix_dynamic_code` — o cron de promessa e o disparo manual/campanha. Antes
 * cada um resolvia a chave do seu jeito: um assumia `CNPJ` por default, o outro
 * adivinhava o tipo pelo formato da chave. As duas divergencias produziam
 * payload que a Meta recusa depois do `queued`.
 */
describe('resolverChavePix', () => {
  it('usa a chave configurada no config da empresa, com o tipo declarado', () => {
    expect(
      resolverChavePix({
        cnpj: '11222333000181',
        config: {
          order_pix_key: 'financeiro@provedor.com.br',
          order_pix_key_type: 'EMAIL',
        },
      }),
    ).toEqual({ key: 'financeiro@provedor.com.br', keyType: 'EMAIL' });
  });

  it('normaliza o tipo para maiusculas', () => {
    expect(
      resolverChavePix({
        config: { order_pix_key: 'chave-evp', order_pix_key_type: 'evp' },
      })?.keyType,
    ).toBe('EVP');
  });

  it('le o config quando ele vem gravado como string JSON', () => {
    expect(
      resolverChavePix({
        config: JSON.stringify({
          order_pix_key: '5511999999999',
          order_pix_key_type: 'PHONE',
        }),
      }),
    ).toEqual({ key: '5511999999999', keyType: 'PHONE' });
  });

  it('cai no CNPJ da empresa quando nao ha chave configurada (comportamento historico)', () => {
    expect(resolverChavePix({ cnpj: '11.222.333/0001-81' })).toEqual({
      key: '11222333000181',
      keyType: 'CNPJ',
    });
  });

  it('NAO cai no CNPJ quando a chave configurada tem tipo invalido', () => {
    // Trocar por outra chave seria pior que nao mandar: o dinheiro iria para
    // uma conta diferente da que alguem configurou. O tipo cru segue para quem
    // monta o botao, que recusa nomeando o valor — se fosse descartado aqui, o
    // log acusaria "chave ausente" para quem acabou de configurar uma.
    expect(
      resolverChavePix({
        cnpj: '11222333000181',
        config: {
          order_pix_key: 'chave-aleatoria',
          order_pix_key_type: 'RANDOM',
        },
      }),
    ).toEqual({ key: 'chave-aleatoria', keyType: 'RANDOM' });
  });

  it('NUNCA deduz o tipo pelo formato da chave', () => {
    // 11 digitos e CPF e telefone sem DDI ao mesmo tempo; UUID e chave
    // aleatoria mas tambem e so texto. Adivinhar aqui manda dinheiro para a
    // conta errada — o tipo vem de quem configurou, ou nao vem.
    expect(
      resolverChavePix({
        config: { order_pix_key: '11122233344' },
      }),
    ).toEqual({ key: '11122233344', keyType: '' });

    expect(
      resolverChavePix({
        config: { order_pix_key: 'e1f2a3b4-c5d6-7890-abcd-ef1234567890' },
      })?.keyType,
    ).toBe('');
  });

  it('devolve null quando a empresa nao tem chave nem CNPJ — NUNCA um default', () => {
    // O teste mais importante deste arquivo, e o menos obvio.
    //
    // "Sem chave" precisa ser um resultado visivel: quem monta o botao nao o
    // monta, o disparo e pulado e o log diz o que falta. Um valor de reserva
    // aqui nao seria conveniencia — o fluxo n8n que dispara este mesmo template
    // hoje carrega `?? "17047165000111"` no campo `key`, que e o CNPJ de UMA
    // das empresas: toda empresa sem CNPJ preenchido cobraria na chave PIX de
    // outra, o cliente pagaria, e ninguem receberia erro nenhum, porque a chave
    // existe — so nao e a de quem cobrou.
    //
    // Se alguem for tentado a "melhorar" isto devolvendo algo em vez de null,
    // este teste e o lugar onde a conversa precisa acontecer primeiro.
    expect(resolverChavePix({ config: {} })).toBeNull();
    expect(resolverChavePix(undefined)).toBeNull();
    expect(resolverChavePix({ cnpj: '', config: { order_pix_key: '   ' } })).toBeNull();
  });
});
