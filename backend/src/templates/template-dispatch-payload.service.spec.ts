import { TemplateDispatchPayloadService } from "./template-dispatch-payload.service";

/**
 * O botao ORDER_DETAILS no disparo manual e nas campanhas.
 *
 * Este e o fluxo que recebeu a recusa da Meta em producao:
 *
 *   CODE: 100 — violated JSON schema constraint 'required'
 *   ... missing 'key_type' ... missing 'key'
 *
 * Ela chega TARDE: o NotificaMe aceita o disparo com `status: queued` e HTTP
 * 200, e a mensagem simplesmente nunca chega. Alem de `key`/`key_type` serem
 * opcionais, o tipo era ADIVINHADO pelo formato da chave — e `RANDOM`, que a
 * infererencia produzia para chave aleatoria, nao existe para a Meta (o valor e
 * `EVP`). Estes testes existem para que nenhuma das duas coisas volte.
 */

/**
 * O servico so usa os repositorios e os servicos de ERP nas rotinas de busca de
 * fatura; a montagem do botao e pura. Os stubs sao vazios de proposito: se o
 * caminho testado passar a tocar banco ou ERP, o teste quebra alto.
 */
const servico = () =>
  new TemplateDispatchPayloadService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

const CONTEXTO = { companyId: "empresa-1", clientId: "cliente-1" };

/** `mapped` completo e valido; cada teste altera so o que quer exercitar. */
const mapped = (extra: Record<string, string | undefined> = {}) => ({
  numero_contrato: "CT-4321",
  code_pix: "00020126BR.GOV.BCB.PIX520400005303986",
  valor_fatura: "120,00",
  nome_empresa: "provedor exemplo",
  order_pix_merchant_name: "provedor exemplo",
  order_pix_key: "11222333000181",
  order_pix_key_type: "CNPJ",
  ...extra,
});

const montar = (extra: Record<string, string | undefined> = {}) => {
  const instancia = servico();
  const warn = jest.spyOn(instancia["logger"], "warn").mockImplementation();
  const botao = instancia["buildOrderDetailsComponent"](
    { type: "ORDER_DETAILS", index: 0 },
    0,
    mapped(extra),
    CONTEXTO,
  );
  return { botao, warn };
};

const pixDynamicCode = (botao: unknown) => {
  const acao = (botao as { parameters: { action: Record<string, any> }[] })
    .parameters[0].action;
  return acao.order_details.payment_settings[0].pix_dynamic_code;
};

describe("buildOrderDetailsComponent — chave PIX", () => {
  it("monta o botao com key e key_type quando os dois estao presentes", () => {
    const { botao } = montar();

    expect(botao).not.toBeNull();
    expect(pixDynamicCode(botao)).toEqual({
      code: "00020126BR.GOV.BCB.PIX520400005303986",
      merchant_name: "provedor exemplo",
      key: "11222333000181",
      key_type: "CNPJ",
    });
  });

  it("aceita EVP — a chave aleatoria da Meta", () => {
    const { botao } = montar({
      order_pix_key: "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
      order_pix_key_type: "EVP",
    });

    expect(pixDynamicCode(botao)).toMatchObject({
      key: "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
      key_type: "EVP",
    });
  });

  it("SEM chave: aborta e loga a empresa, o cliente e os campos que faltam", () => {
    const { botao, warn } = montar({
      order_pix_key: undefined,
      order_pix_key_type: undefined,
    });

    expect(botao).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);

    const mensagem = String(warn.mock.calls[0][0]);
    expect(mensagem).toContain("empresa-1");
    expect(mensagem).toContain("cliente-1");
    expect(mensagem).toContain("order_pix_key");
    expect(mensagem).toContain("order_pix_key_type");
  });

  it("SEM tipo: aborta — o tipo nao e deduzido nem assume CNPJ", () => {
    const { botao, warn } = montar({ order_pix_key_type: undefined });

    expect(botao).toBeNull();
    expect(String(warn.mock.calls[0][0])).toContain("order_pix_key_type");
  });

  it('tipo INVALIDO ("RANDOM"): aborta e diz qual valor foi recusado', () => {
    // `RANDOM` era o valor que a infererencia removida produzia para chave
    // aleatoria. A Meta nao o conhece — ela usa `EVP`.
    const { botao, warn } = montar({
      order_pix_key: "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
      order_pix_key_type: "RANDOM",
    });

    expect(botao).toBeNull();

    const mensagem = String(warn.mock.calls[0][0]);
    expect(mensagem).toContain('order_pix_key_type invalido ("RANDOM")');
    // Nao pode acusar chave ausente: a chave ESTA la, o problema e o tipo.
    expect(mensagem).not.toContain("order_pix_key,");
  });

  it("NAO infere o tipo pelo formato: 11 digitos nao viram CPF sozinhos", () => {
    // O `inferPixKeyType` removido devolvia CPF para 11 digitos — que e
    // igualmente o formato de telefone sem DDI. Tipo errado gera payload que a
    // Meta ACEITA e o banco do cliente recusa.
    const { botao, warn } = montar({
      order_pix_key: "11122233344",
      order_pix_key_type: undefined,
    });

    expect(botao).toBeNull();
    expect(String(warn.mock.calls[0][0])).toContain("order_pix_key_type");
  });

  it("NAO infere o tipo pelo formato: e-mail nao vira EMAIL sozinho", () => {
    const { botao } = montar({
      order_pix_key: "financeiro@provedor.com.br",
      order_pix_key_type: undefined,
    });

    expect(botao).toBeNull();
  });

  it("nunca monta pix_dynamic_code sem key ou key_type", () => {
    const pix = pixDynamicCode(montar().botao) as Record<string, unknown>;

    expect(Object.keys(pix).sort()).toEqual([
      "code",
      "key",
      "key_type",
      "merchant_name",
    ]);
  });
});

describe("buildRecipientFromBlueprint — ORDER_DETAILS", () => {
  const componentes = [
    { type: "BUTTONS", buttons: [{ type: "ORDER_DETAILS", index: 0 }] },
  ];

  const construir = (extra: Record<string, string | undefined> = {}) => {
    const instancia = servico();
    jest.spyOn(instancia["logger"], "warn").mockImplementation();
    jest.spyOn(instancia["logger"], "log").mockImplementation();
    return instancia["buildRecipientFromBlueprint"](
      { "1": "nome_cliente" },
      componentes,
      { ...mapped(extra), nome_cliente: "FULANO" },
      CONTEXTO,
    );
  };

  it("monta o destinatario quando a chave esta completa", () => {
    const built = construir();

    expect(built).not.toBeNull();
    expect(built?.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sub_type: "order_details" }),
      ]),
    );
  });

  it("PULA o destinatario inteiro quando o botao nao pode ser montado", () => {
    // Mandar a mensagem sem o botao nao salvaria nada: a Meta exige parametro
    // para todo botao dinamico do template aprovado e recusaria igual, depois
    // do `queued`. O destinatario vira um skip visivel no relatorio.
    expect(construir({ order_pix_key: undefined })).toBeNull();
  });
});
