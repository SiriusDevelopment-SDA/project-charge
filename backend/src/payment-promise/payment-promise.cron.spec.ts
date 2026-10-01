import { PaymentPromiseCron } from './payment-promise.cron';
import type { Invoice } from '../invoices/entities/invoices';
import type { PaymentPromise } from './entities/payment-promise.entity';
import type { Templates } from '../templates/entities/templatesMeta';

/**
 * O botao ORDER_DETAILS e a chave PIX.
 *
 * A Meta exige `key` E `key_type` dentro de `pix_dynamic_code`. Ate esta
 * correcao os dois eram opcionais aqui, e o defeito era invisivel: o NotificaMe
 * aceitava o disparo e devolvia `status: queued` com HTTP 200, a recusa vinha
 * DEPOIS da Meta —
 *
 *   CODE: 100 — violated JSON schema constraint 'required'
 *   ... missing 'key_type' ... missing 'key'
 *
 * — e o operador via a mensagem enfileirada que nunca chegava. Estes testes
 * existem para que nao volte a ser possivel montar um botao que a Meta recusa.
 */

/**
 * O cron so precisa dos repositorios para as rotinas de banco; tudo que estes
 * testes exercitam e puro (monta payload a partir de dados em memoria). Os
 * stubs sao vazios de proposito: se algum caminho testado passar a tocar o
 * banco, o teste quebra alto em vez de esconder a chamada nova.
 */
const cron = () =>
  new PaymentPromiseCron(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

type Empresa = {
  name?: string | null;
  cnpj?: string | null;
  config?: Record<string, unknown> | string | null;
};

const template = (empresa: Empresa, components: unknown[] = []) =>
  ({
    id: 'tpl-1',
    name: 'lembrete_promessa',
    variables: {},
    components,
    // O nome da empresa vira `merchant_name`, que tambem e obrigatorio para a
    // Meta. Vem preenchido por padrao para que cada teste isole a chave PIX.
    company: { name: 'PROVEDOR EXEMPLO', ...empresa },
  }) as unknown as Templates;

const promessa = () =>
  ({
    id: 'promessa-1',
    client_id: 'cliente-1',
    company_id: 'empresa-1',
    phone: '5511999999999',
    client_name: 'FULANO DE TAL',
    promised_payment_date: '2026-09-10',
  }) as unknown as PaymentPromise;

const fatura = () =>
  ({
    expiration: '2026-09-10',
    value: '120,00',
    pixCode: '00020126BR.GOV.BCB.PIX520400005303986',
    contractId: 'CT-4321',
  }) as unknown as Invoice;

const CONTEXTO = { companyId: 'empresa-1', promiseId: 'promessa-1' };

/** Valores como `buildReminderVariableValues` os produz, com a empresa dada. */
const valores = (empresa: Empresa) =>
  cron()['buildReminderVariableValues'](promessa(), template(empresa), fatura());

const montarBotao = (empresa: Empresa) => {
  const instancia = cron();
  const warn = jest.spyOn(instancia['logger'], 'warn').mockImplementation();
  const botao = instancia['buildReminderButton'](
    { type: 'ORDER_DETAILS', index: 0 },
    0,
    instancia['buildReminderVariableValues'](
      promessa(),
      template(empresa),
      fatura(),
    ),
    CONTEXTO,
  );
  return { botao, warn };
};

/** `pix_dynamic_code` de dentro do botao montado, sem navegar a arvore no teste. */
const pixDynamicCode = (botao: unknown) => {
  const acao = (botao as { parameters: { action: Record<string, any> }[] })
    .parameters[0].action;
  return acao.order_details.payment_settings[0].pix_dynamic_code;
};

describe('buildReminderVariableValues', () => {
  it('publica a chave e o tipo resolvidos nas variaveis do lembrete', () => {
    const v = valores({
      cnpj: '11222333000181',
      config: { order_pix_key: '5511999999999', order_pix_key_type: 'PHONE' },
    });

    expect(v.order_pix_key).toBe('5511999999999');
    expect(v.order_pix_key_type).toBe('PHONE');
  });

  it('deixa os dois VAZIOS quando nao ha chave — nunca meio preenchidos', () => {
    const v = valores({ cnpj: null, config: {} });

    expect(v.order_pix_key).toBe('');
    expect(v.order_pix_key_type).toBe('');
  });
});

describe('buildReminderButton — ORDER_DETAILS', () => {
  it('monta o botao com key e key_type quando a chave esta configurada', () => {
    const { botao } = montarBotao({
      config: {
        order_pix_key: 'financeiro@provedor.com.br',
        order_pix_key_type: 'EMAIL',
      },
    });

    expect(botao).not.toBeNull();
    expect(pixDynamicCode(botao)).toEqual({
      code: '00020126BR.GOV.BCB.PIX520400005303986',
      merchant_name: expect.any(String),
      key: 'financeiro@provedor.com.br',
      key_type: 'EMAIL',
    });
  });

  it('monta com CNPJ quando a empresa so tem o CNPJ cadastrado', () => {
    const { botao } = montarBotao({ cnpj: '11222333000181' });

    expect(pixDynamicCode(botao)).toMatchObject({
      key: '11222333000181',
      key_type: 'CNPJ',
    });
  });

  it('SEM chave: devolve null e loga a empresa e o campo que falta', () => {
    const { botao, warn } = montarBotao({ cnpj: null, config: {} });

    expect(botao).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);

    const mensagem = String(warn.mock.calls[0][0]);
    expect(mensagem).toContain('empresa-1');
    expect(mensagem).toContain('promessa-1');
    expect(mensagem).toContain('order_pix_key');
    expect(mensagem).toContain('order_pix_key_type');
  });

  it('SEM tipo: devolve null — o tipo nao e deduzido nem assume CNPJ', () => {
    // O default silencioso `key_type: 'CNPJ'` que existia aqui rotulava
    // qualquer chave como CNPJ, inclusive e-mail e chave aleatoria.
    const { botao, warn } = montarBotao({
      config: { order_pix_key: 'financeiro@provedor.com.br' },
    });

    expect(botao).toBeNull();
    expect(String(warn.mock.calls[0][0])).toContain('order_pix_key_type');
  });

  it('tipo INVALIDO ("RANDOM"): devolve null e diz qual valor foi recusado', () => {
    // A chave aleatoria e `EVP` para a Meta. `RANDOM` passa por qualquer
    // validacao ingenua e e recusado la, depois do `queued`.
    const { botao, warn } = montarBotao({
      config: {
        order_pix_key: 'e1f2a3b4-c5d6-7890-abcd-ef1234567890',
        order_pix_key_type: 'RANDOM',
      },
    });

    expect(botao).toBeNull();

    const mensagem = String(warn.mock.calls[0][0]);
    expect(mensagem).toContain('order_pix_key_type invalido ("RANDOM")');
    // Nao pode acusar chave ausente: a chave ESTA configurada, o problema e o
    // tipo. Errar o diagnostico aqui manda o operador procurar no lugar errado.
    expect(mensagem).not.toContain('order_pix_key,');
  });

  it('nunca monta pix_dynamic_code sem key ou key_type', () => {
    const { botao } = montarBotao({
      config: { order_pix_key: 'chave', order_pix_key_type: 'EVP' },
    });
    const pix = pixDynamicCode(botao) as Record<string, unknown>;

    expect(Object.keys(pix).sort()).toEqual([
      'code',
      'key',
      'key_type',
      'merchant_name',
    ]);
  });
});

describe('buildReminderPayload — template com ORDER_DETAILS', () => {
  const componentes = [
    { type: 'BUTTONS', buttons: [{ type: 'ORDER_DETAILS', index: 0 }] },
  ];

  it('monta o payload quando a chave esta configurada', () => {
    const payload = cron()['buildReminderPayload'](
      promessa(),
      template(
        { config: { order_pix_key: '11222333000181', order_pix_key_type: 'CNPJ' } },
        componentes,
      ),
      fatura(),
    );

    expect(payload?.components).toHaveLength(1);
    expect(payload?.components[0]).toMatchObject({ sub_type: 'order_details' });
  });

  it('ABORTA o lembrete inteiro quando o botao nao pode ser montado', () => {
    // Enviar a mensagem sem o botao nao salvaria nada: a Meta exige parametro
    // para todo botao dinamico do template aprovado e recusaria igual, depois
    // do `queued`. Sem payload, `enqueueReminderWithTemplate` devolve false, a
    // promessa nao e marcada como lembrada e o cron tenta de novo na hora
    // seguinte — reclamando no log ate alguem configurar a chave.
    const instancia = cron();
    jest.spyOn(instancia['logger'], 'warn').mockImplementation();

    const payload = instancia['buildReminderPayload'](
      promessa(),
      template({ cnpj: null, config: {} }, componentes),
      fatura(),
    );

    expect(payload).toBeNull();
  });
});
