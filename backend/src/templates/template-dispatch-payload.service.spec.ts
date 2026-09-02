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

/**
 * ERP indisponivel x cliente sem fatura — dois desfechos que chegavam iguais.
 *
 * O preload de faturas consulta o ERP ao vivo, cliente por cliente, dentro de um
 * try/catch. Ate esta correcao a excecao virava lista vazia, e lista vazia
 * produzia o mesmo skip de quem realmente quitou
 * (`invoice_not_open_in_erp`). O agendador entao concluia a campanha e ela se
 * perdia pelo resto do dia com o relatorio dizendo que ninguem devia nada.
 *
 * O que estes testes trancam: a falha do ERP tem que chegar ao chamador
 * separada, e separada tambem por natureza — o que pode passar sozinho
 * (`erp_unavailable`) nao se confunde com o que exige alguem mexer no cadastro
 * (`erp_integration_error`).
 */
describe("buildQueueRecipients — falha de ERP no preload", () => {
  /** `Client.id` e uuid na base: o service descarta clientId fora do formato. */
  const idCliente = (sufixo: string) => `0000000${sufixo}-0000-4000-8000-000000000000`;

  const cliente = (sufixo: string) => ({
    id: idCliente(sufixo),
    name: `Cliente ${sufixo}`,
    whatsapp: `551199999000${sufixo}`,
    cnpj_cpf: "11222333000181",
    company: { id: "empresa-1", erp: "SGP", name: "provedor exemplo" },
  });

  const linha = (sufixo: string) => ({
    clientId: idCliente(sufixo),
    whatsapp: `551199999000${sufixo}`,
    nome_cliente: `Cliente ${sufixo}`,
    invoice_id: `fatura-${sufixo}`,
  });

  /** Template que USA dado de fatura — sem isso o preload nem roda. */
  const template = {
    id: "template-1",
    variables: { "1": "valor_fatura" },
    components: [],
  } as never;

  const montar = (
    clientes: ReturnType<typeof cliente>[],
    getInvoices: jest.Mock,
  ) => {
    const instancia = new TemplateDispatchPayloadService(
      { find: jest.fn(async () => clientes) } as never,
      {} as never,
      {} as never,
      {} as never,
      { getInvoices } as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(instancia["logger"], "warn").mockImplementation();
    jest.spyOn(instancia["logger"], "log").mockImplementation();
    return instancia;
  };

  it("marca erp_unavailable quando o ERP nao responde", async () => {
    const servico = montar(
      [cliente("1")],
      jest.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    const { recipients, skips } = await servico.buildQueueRecipients(
      template,
      "empresa-1",
      [linha("1")],
    );

    expect(recipients).toHaveLength(0);
    expect(skips).toHaveLength(1);
    expect(skips[0].reason).toBe("erp_unavailable");
    expect(skips[0].detail).toContain("não respondeu");
  });

  it("marca erp_integration_error quando o ERP recusa a credencial", async () => {
    const servico = montar(
      [cliente("1")],
      jest.fn(async () => {
        throw new Error("Erro no ERP (SGP): 401 -> Unauthorized");
      }),
    );

    const { skips } = await servico.buildQueueRecipients(template, "empresa-1", [
      linha("1"),
    ]);

    expect(skips[0].reason).toBe("erp_integration_error");
  });

  it("mantem invoice_not_open_in_erp quando o ERP responde e nao ha fatura", async () => {
    // Comportamento legitimo, e o que NAO pode mudar: com o ERP saudavel o
    // cliente que quitou continua sendo um skip normal e a campanha conclui.
    const servico = montar(
      [cliente("1")],
      jest.fn(async () => ({ status: "success", message: "ok", list: [] })),
    );

    const { skips } = await servico.buildQueueRecipients(template, "empresa-1", [
      linha("1"),
    ]);

    expect(skips[0].reason).toBe("invoice_not_open_in_erp");
  });

  it("isola a falha por cliente: quem o ERP atendeu segue no disparo", async () => {
    const getInvoices = jest.fn(async (c: { id: string }) => {
      if (c.id === idCliente("2")) throw new TypeError("fetch failed");
      return {
        status: "success",
        message: "ok",
        list: [
          {
            invoice_id: "fatura-1",
            contract_id: "CT-1",
            invoice_due_date: "10/09/2026",
            invoice_amount: "120,00",
            invoice_status: "A Receber",
            ticket_digitable_line: "",
            ticket_pdf_link: "",
            code_pix: null,
          },
        ],
      };
    });

    const servico = montar([cliente("1"), cliente("2")], getInvoices);

    const { recipients, skips } = await servico.buildQueueRecipients(
      template,
      "empresa-1",
      [linha("1"), linha("2")],
    );

    expect(recipients).toHaveLength(1);
    expect(recipients[0].number).toBe("5511999990001");
    expect(skips).toEqual([
      expect.objectContaining({
        reason: "erp_unavailable",
        clientId: idCliente("2"),
      }),
    ]);
  });
});

/**
 * Fallback de PIX da Gama ISP.
 *
 * A busca por documento traz `pix_qrcode` na maioria das faturas, mas nao em
 * todas: em 02/09/2026 a POWERNET disparou para uma fatura EM ABERTO, com valor
 * e vencimento, e `pix_qrcode` null. Sem PIX o botao ORDER_DETAILS nao monta e
 * o destinatario e pulado inteiro. A Gama expoe a fatura completa por id, e e
 * dela que o PIX passa a ser buscado quando a listagem nao traz.
 */
describe("buildDispatchScalars — PIX da Gama ISP", () => {
  const company = { id: "empresa-1", erp: "GAMAISP" } as never;
  const client = { id: "cliente-1", company } as never;

  const fatura = (codePix: string | null) => [
    {
      invoice_id: "9001",
      contract_id: "CT-1",
      invoice_due_date: "30/08/2026",
      invoice_amount: "22,93",
      invoice_status: "A Receber",
      ticket_digitable_line: "75691301770131774161",
      ticket_pdf_link: null,
      code_pix: codePix,
    },
  ];

  const montarGama = (fetchPixByInvoice: jest.Mock) => {
    const instancia = new TemplateDispatchPayloadService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { fetchPixByInvoice } as never,
    );
    jest.spyOn(instancia["logger"], "warn").mockImplementation();
    jest.spyOn(instancia["logger"], "log").mockImplementation();
    return instancia;
  };

  const escalares = (
    instancia: TemplateDispatchPayloadService,
    lista: ReturnType<typeof fatura>,
  ) =>
    instancia["buildDispatchScalars"](
      client,
      "GAMAISP",
      "9001",
      undefined,
      undefined,
      undefined,
      undefined,
      lista as never,
    );

  it("busca o PIX por id quando a listagem por documento nao traz", async () => {
    const fetchPixByInvoice = jest.fn(async () => "00020126BR.GOV.BCB.PIX");
    const instancia = montarGama(fetchPixByInvoice);

    const fresh = await escalares(instancia, fatura(null));

    expect(fetchPixByInvoice).toHaveBeenCalledWith(company, "9001");
    expect(fresh?.code_pix).toBe("00020126BR.GOV.BCB.PIX");
    // Os quatro apelidos do mesmo codigo andam juntos: se um ficar para tras, o
    // botao e o parametro de texto do template divergem.
    expect(fresh?.codigo_qr).toBe("00020126BR.GOV.BCB.PIX");
    expect(fresh?.codigo_qr_code).toBe("00020126BR.GOV.BCB.PIX");
    expect(fresh?.codigo_pix).toBe("00020126BR.GOV.BCB.PIX");
  });

  it("NAO gasta chamada extra quando a listagem ja trouxe o PIX", async () => {
    const fetchPixByInvoice = jest.fn();
    const instancia = montarGama(fetchPixByInvoice);

    const fresh = await escalares(instancia, fatura("00020126JA.VEIO.NA.LISTA"));

    expect(fetchPixByInvoice).not.toHaveBeenCalled();
    expect(fresh?.code_pix).toBe("00020126JA.VEIO.NA.LISTA");
  });

  it("segue sem PIX quando o ERP tambem nao tem a fatura por id", async () => {
    const fetchPixByInvoice = jest.fn(async () => null);
    const instancia = montarGama(fetchPixByInvoice);

    const fresh = await escalares(instancia, fatura(null));

    expect(fetchPixByInvoice).toHaveBeenCalledTimes(1);
    // Vazio, nao nulo: quem monta o botao pula o destinatario e registra o
    // motivo. O lote inteiro nao pode cair por causa de uma fatura.
    expect(fresh?.code_pix).toBe("");
    expect(fresh?.valor_fatura).toBe("22,93");
  });
});
