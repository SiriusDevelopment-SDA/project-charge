import { BadRequestException } from '@nestjs/common';
import { GamaIspInvoicesService } from './gamaIspInvoicesService';
import type { RedisService } from '../../redis/redis.service';
import type { Client } from '../../clients/entities.ts/clients';
import type { Company } from '../../companies/entities/companies';
import type { GamaIspCliente, GamaIspFatura } from '../types/gamaIspTypes';

/**
 * Cobre o que a Gama ISP tem de proprio e de arriscado, sem tocar na rede: o
 * `fetch` global e o Redis sao substituidos por dublês.
 *
 * O foco e o que quebra em producao se alguem mexer sem ler:
 * - o filtro de faturas (a rota devolve as PAGAS junto com as em aberto);
 * - o PIX chegando no `code_pix` (e o diferencial deste ERP);
 * - o corpo nao-JSON vindo com HTTP 200 (fatal error do PHP) sendo tratado como
 *   erro, e nao como "cliente sem fatura".
 *
 * TODOS os dados aqui sao sinteticos: documento zerado, ids inventados e um PIX
 * que so imita o formato. Nada de credencial e nada de cliente real.
 */
describe('GamaIspInvoicesService — disparo por cliente', () => {
  const fetchOriginal = global.fetch;
  const fetchMock = jest.fn();

  /**
   * Redis com token ja em cache — assim os testes exercitam a rota de negocio e
   * nao a autenticacao. Responde POR CHAVE de proposito: devolver o token para
   * qualquer chave faria o cache do lote de faturas (`gamaisp:invoice-batch:*`)
   * retornar uma string onde o codigo espera pares [clienteId, faturas].
   */
  const redisComToken = (valores: Record<string, unknown> = {}) =>
    ({
      get: jest.fn(async (chave: string) =>
        chave.startsWith('gamaisp:session-token')
          ? 'jwt-sintetico'
          : (valores[chave] ?? null),
      ),
      set: jest.fn(async () => undefined),
      del: jest.fn(async () => undefined),
    }) as unknown as RedisService;

  const redisStub = redisComToken();

  const service = new GamaIspInvoicesService(redisStub);

  /**
   * `Client` tem muitos campos obrigatorios (relacoes TypeORM inclusive) que nao
   * participam desta regra. O cast mantem a fixture legivel sem afrouxar o tipo
   * do codigo de producao.
   */
  const cliente = {
    id: 'client-uuid',
    cnpj_cpf: '000.000.000-00',
    company: {
      id: 'company-uuid',
      url: 'erp.exemplo.test',
      config: {
        rest_key: 'chave-de-teste',
        login: 'login-de-teste',
        password: 'senha-de-teste',
      },
    },
  } as unknown as Client;

  const responseWith = (status: number, body: string) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
    }) as unknown as Response;

  const okBody = (faturas: Partial<GamaIspFatura>[]) =>
    JSON.stringify({
      status: 'success',
      data: faturas,
      count: faturas.length,
      total: faturas.length,
    });

  // Vencimentos deliberadamente extremos para o `overdue` ser deterministico
  // sem congelar o relogio.
  const VENCIDA = '2020-01-10';
  const A_VENCER = '2099-12-31';
  /** Como `formatarDataBR` (util do IXC/SGP) devolve o vencimento: DD/MM/AA. */
  const VENCIDA_BR = '10/01/20';

  const faturaAberta: Partial<GamaIspFatura> = {
    id: 101,
    cliente_id: 7,
    cliente_contrato_id: 55,
    data_emissao: '2020-01-01',
    data_vencimento: VENCIDA,
    data_pagamento: null,
    valor_total: '64.90',
    linha_digitavel: '00190000090000000000000000000000000000000000',
    codigo_de_barras: '00191000000000000000000000000000000000000000',
    pix_qrcode: '000201SINTETICO5204000053039865802BR6304ABCD',
    url_cobranca_gateway: null,
    desativada: 'N',
    excluida: 'N',
  };

  beforeAll(() => {
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = fetchOriginal;
  });

  beforeEach(() => {
    fetchMock.mockReset();
  });

  describe('mapeamento', () => {
    it('mapeia uma fatura em aberto para o DTO de disparo', async () => {
      fetchMock.mockResolvedValue(responseWith(200, okBody([faturaAberta])));

      const result = await service.getInvoices(cliente);

      expect(result.status).toBe('success');
      expect(result.list).toEqual([
        {
          invoice_id: '101',
          contract_id: '55',
          // Convertido para o formato brasileiro: este valor vai LITERALMENTE
          // para a mensagem do cliente, como nos demais adapters.
          invoice_due_date: VENCIDA_BR,
          invoice_amount: '64.90',
          invoice_status: 'A Receber',
          overdue: true,
          ticket_digitable_line: faturaAberta.linha_digitavel,
          // Sempre null nesta entrega: a Gama ISP so devolve o boleto em base64,
          // sem URL publica.
          ticket_pdf_link: null,
          code_pix: faturaAberta.pix_qrcode,
        },
      ]);
    });

    it('entrega o pix_qrcode em code_pix (o PIX vem no mesmo payload)', async () => {
      fetchMock.mockResolvedValue(responseWith(200, okBody([faturaAberta])));

      const result = await service.getInvoices(cliente);

      expect(result.list[0].code_pix).toBe(faturaAberta.pix_qrcode);
    });

    it('marca overdue apenas quando o vencimento ja passou', async () => {
      fetchMock.mockResolvedValue(
        responseWith(
          200,
          okBody([
            { ...faturaAberta, id: 1, data_vencimento: A_VENCER },
            { ...faturaAberta, id: 2, data_vencimento: VENCIDA },
          ]),
        ),
      );

      const result = await service.getInvoices(cliente);
      const porId = new Map(result.list.map((i) => [i.invoice_id, i.overdue]));

      expect(porId.get('1')).toBe(false);
      expect(porId.get('2')).toBe(true);
    });

    it('ordena por vencimento, do mais recente para o mais antigo', async () => {
      fetchMock.mockResolvedValue(
        responseWith(
          200,
          okBody([
            { ...faturaAberta, id: 1, data_vencimento: '2026-02-10' },
            { ...faturaAberta, id: 2, data_vencimento: '2026-11-05' },
            { ...faturaAberta, id: 3, data_vencimento: '2026-07-01' },
          ]),
        ),
      );

      const result = await service.getInvoices(cliente);

      expect(result.list.map((i) => i.invoice_id)).toEqual(['2', '3', '1']);
    });

    it('normaliza o documento (sem mascara) na URL consultada', async () => {
      fetchMock.mockResolvedValue(responseWith(200, okBody([])));

      await service.getInvoices(cliente);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toContain(
        '/api/v1/faturas/doc/00000000000',
      );
    });
  });

  describe('filtro de faturas', () => {
    it('descarta as pagas (data_pagamento preenchida)', async () => {
      fetchMock.mockResolvedValue(
        responseWith(
          200,
          okBody([
            { ...faturaAberta, id: 1 },
            { ...faturaAberta, id: 2, data_pagamento: '2020-01-09' },
          ]),
        ),
      );

      const result = await service.getInvoices(cliente);

      expect(result.list.map((i) => i.invoice_id)).toEqual(['1']);
    });

    it('descarta as marcadas como excluida ou desativada', async () => {
      fetchMock.mockResolvedValue(
        responseWith(
          200,
          okBody([
            { ...faturaAberta, id: 1 },
            { ...faturaAberta, id: 2, excluida: 'S' },
            { ...faturaAberta, id: 3, desativada: 'S' },
          ]),
        ),
      );

      const result = await service.getInvoices(cliente);

      expect(result.list.map((i) => i.invoice_id)).toEqual(['1']);
    });

    it('devolve lista vazia sem lancar quando data vem vazio (documento inexistente)', async () => {
      fetchMock.mockResolvedValue(responseWith(200, okBody([])));

      const result = await service.getInvoices(cliente);

      expect(result.status).toBe('success');
      expect(result.list).toEqual([]);
    });
  });

  describe('respostas mentirosas da API', () => {
    it('trata corpo nao-JSON como erro, mesmo com HTTP 200 (fatal error do PHP)', async () => {
      fetchMock.mockResolvedValue(
        responseWith(
          200,
          '<pre><b>Fatal error</b>:  Allowed memory size of 268435456 bytes exhausted</pre>',
        ),
      );

      await expect(service.getInvoices(cliente)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getInvoices(cliente)).rejects.toThrow(
        /nao e JSON/,
      );
    });

    it('trata envelope sem status "success" como erro, mesmo com HTTP 200', async () => {
      fetchMock.mockResolvedValue(
        responseWith(200, JSON.stringify({ status: 'error', data: [] })),
      );

      await expect(service.getInvoices(cliente)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('credenciais', () => {
    it('recusa a consulta quando falta credencial no config da empresa', async () => {
      const semCredencial = {
        ...cliente,
        company: { ...cliente.company, config: {} },
      } as unknown as Client;

      await expect(service.getInvoices(semCredencial)).rejects.toThrow(
        BadRequestException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  /**
   * O disparo chama `getInvoices` uma vez POR CLIENTE, todas em paralelo, num
   * laco que e compartilhado com IXC/SGP/MK/HUBSOFT e que por isso nao pode ser
   * alterado. A protecao mora aqui dentro. Estes testes cobrem o teto e — o mais
   * importante — a devolucao da vaga quando a chamada falha.
   */
  describe('teto de concorrencia por empresa', () => {
    /**
     * Cada teste usa um companyId proprio: o portao e indexado por empresa e um
     * service novo por teste evita que um teste herde a fila do anterior.
     */
    const clienteDaEmpresa = (id: string, extraConfig: Record<string, unknown>) =>
      ({
        ...cliente,
        company: {
          ...cliente.company,
          id,
          config: { ...(cliente.company as any).config, ...extraConfig },
        },
      }) as unknown as Client;

    /** Conta quantas chamadas ao ERP estao em voo ao mesmo tempo. */
    const medirPico = (duracaoMs: number) => {
      const medida = { emVoo: 0, pico: 0 };
      fetchMock.mockImplementation(async () => {
        medida.emVoo++;
        medida.pico = Math.max(medida.pico, medida.emVoo);
        await new Promise((resolve) => setTimeout(resolve, duracaoMs));
        medida.emVoo--;
        return responseWith(200, okBody([]));
      });
      return medida;
    };

    it('nunca deixa passar mais chamadas simultaneas que o teto padrao (3)', async () => {
      const svc = new GamaIspInvoicesService(redisStub);
      const alvo = clienteDaEmpresa('empresa-teto-padrao', {});
      const medida = medirPico(5);

      await Promise.all(Array.from({ length: 10 }, () => svc.getInvoices(alvo)));

      expect(fetchMock).toHaveBeenCalledTimes(10);
      expect(medida.pico).toBe(3);
    });

    it('respeita invoicesConcurrency do config no lugar do default', async () => {
      const svc = new GamaIspInvoicesService(redisStub);
      const alvo = clienteDaEmpresa('empresa-teto-config', {
        invoicesConcurrency: 1,
      });
      const medida = medirPico(2);

      await Promise.all(Array.from({ length: 4 }, () => svc.getInvoices(alvo)));

      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(medida.pico).toBe(1);
    });

    it('devolve a vaga quando a chamada lanca (o defeito classico do finally)', async () => {
      const svc = new GamaIspInvoicesService(redisStub);
      const alvo = clienteDaEmpresa('empresa-vaga-vazada', {
        invoicesConcurrency: 1,
      });

      fetchMock.mockResolvedValueOnce(responseWith(500, 'ERP fora do ar'));
      await expect(svc.getInvoices(alvo)).rejects.toThrow(BadRequestException);

      // Com a unica vaga vazada, esta segunda chamada ficaria presa na fila para
      // sempre e o teste estouraria por timeout em vez de falhar por assercao.
      fetchMock.mockResolvedValueOnce(
        responseWith(200, okBody([faturaAberta])),
      );
      const result = await svc.getInvoices(alvo);

      expect(result.list).toHaveLength(1);
    });
  });

  describe('single-flight da autenticacao', () => {
    /** JWT sintetico: so o payload importa, e dele sai o TTL do cache. */
    const jwtSintetico = (expiraEmSegundos: number) =>
      [
        'cabecalho-sintetico',
        Buffer.from(
          JSON.stringify({
            expires: Math.floor(Date.now() / 1000) + expiraEmSegundos,
          }),
        ).toString('base64url'),
        'assinatura-sintetica',
      ].join('.');

    /** Redis frio: e tambem o comportamento real quando o Redis esta fora do ar. */
    const redisFrio = () =>
      ({
        get: jest.fn(async () => null),
        set: jest.fn(async () => undefined),
        del: jest.fn(async () => undefined),
      }) as unknown as RedisService;

    const clienteAuth = (id: string) =>
      ({
        ...cliente,
        company: {
          ...cliente.company,
          id,
          config: {
            ...(cliente.company as any).config,
            // Teto alto de proposito: aqui o que se mede e a deduplicacao da
            // autenticacao, nao o semaforo.
            invoicesConcurrency: 10,
          },
        },
      }) as unknown as Client;

    const responderAuthLenta = (contador: { auths: number }, jwt: string) => {
      fetchMock.mockImplementation(async (url: unknown) => {
        if (String(url).includes('/api/v1/auth')) {
          contador.auths++;
          await new Promise((resolve) => setTimeout(resolve, 5));
          return responseWith(
            200,
            JSON.stringify({ status: 'success', data: jwt }),
          );
        }
        return responseWith(200, okBody([]));
      });
    };

    it('com cache frio, N chamadas concorrentes produzem UMA autenticacao', async () => {
      const svc = new GamaIspInvoicesService(redisFrio());
      const contador = { auths: 0 };
      responderAuthLenta(contador, jwtSintetico(3 * 60 * 60));

      await Promise.all(
        Array.from({ length: 5 }, () =>
          svc.getInvoices(clienteAuth('empresa-single-flight')),
        ),
      );

      expect(contador.auths).toBe(1);
    });

    it('deriva o TTL do cache do campo expires do JWT, ja com a margem', async () => {
      const redis = redisFrio();
      const svc = new GamaIspInvoicesService(redis);
      const contador = { auths: 0 };
      responderAuthLenta(contador, jwtSintetico(3 * 60 * 60));

      await svc.getInvoices(clienteAuth('empresa-ttl'));

      const [chave, , ttl] = (redis.set as jest.Mock).mock.calls[0];
      expect(chave).toBe('gamaisp:session-token:empresa-ttl');
      // 3h de token menos os 300s de margem, tolerando o tempo do proprio teste.
      expect(ttl).toBeLessThanOrEqual(10_500);
      expect(ttl).toBeGreaterThan(10_490);
    });
  });

  /**
   * Sincronizacao (clientes + faturas). Tudo sem rede: o `fetch` global responde
   * conforme o `offset` da query string, que e o unico parametro de paginacao que
   * esta API respeita.
   */
  describe('sincronizacao', () => {
    const empresa = (id: string, extra: Record<string, unknown> = {}) =>
      ({
        ...(cliente.company as object),
        id,
        config: { ...(cliente.company as any).config, ...extra },
      }) as unknown as Company;

    /** Cliente sintetico da API. `contato` e sempre explicito em cada teste. */
    const clienteApi = (
      id: number,
      extra: Partial<GamaIspCliente> = {},
    ): GamaIspCliente => ({
      id,
      // Documento sintetico, derivado do proprio id — nunca um CPF real.
      cpf_cnpj: String(10000000000 + id),
      nome: `CLIENTE SINTETICO ${id}`,
      situacao: 'Regular',
      contato: [{ tipo_id: 2, tipo: 'WhatsApp', valor: '(11) 90000-0001' }],
      endereco: null,
      cobranca: null,
      ...extra,
    });

    const envelope = (data: unknown[], total?: number) =>
      JSON.stringify({
        status: 'success',
        data,
        count: data.length,
        total: total ?? data.length,
      });

    /** Responde cada pagina fatiando `todos` conforme offset/limit da URL. */
    const paginar = (todos: unknown[]) => {
      fetchMock.mockImplementation(async (url: unknown) => {
        const params = new URL(String(url)).searchParams;
        const offset = Number(params.get('offset'));
        const limit = Number(params.get('limit'));
        return responseWith(
          200,
          envelope(todos.slice(offset, offset + limit), todos.length),
        );
      });
    };

    describe('clientes', () => {
      it('pagina ate a pagina incompleta e devolve todos os clientes', async () => {
        const svc = new GamaIspInvoicesService(redisComToken());
        const todos = Array.from({ length: 250 }, (_, i) => clienteApi(i + 1));
        paginar(todos);

        const result = await svc.fetchClients(empresa('empresa-paginacao'));

        expect(result).toHaveLength(250);
        // 100 + 100 + 50: a terceira pagina vem incompleta e encerra a varredura.
        expect(fetchMock).toHaveBeenCalledTimes(3);
      });

      it('encerra na pagina vazia quando o total e multiplo do tamanho da pagina', async () => {
        const svc = new GamaIspInvoicesService(redisComToken());
        paginar(Array.from({ length: 200 }, (_, i) => clienteApi(i + 1)));

        const result = await svc.fetchClients(empresa('empresa-multiplo'));

        expect(result).toHaveLength(200);
        // 2 paginas cheias + 1 vazia para descobrir que acabou.
        expect(fetchMock).toHaveBeenCalledTimes(3);
      });

      it('para quando a API ignora o offset e repete a mesma pagina', async () => {
        const svc = new GamaIspInvoicesService(redisComToken());
        const primeira = Array.from({ length: 100 }, (_, i) => clienteApi(i + 1));
        // Ignora offset: devolve sempre a mesma pagina cheia.
        fetchMock.mockImplementation(async () =>
          responseWith(200, envelope(primeira, 3998)),
        );

        const result = await svc.fetchClients(empresa('empresa-sem-offset'));

        expect(result).toHaveLength(100);
        // 2a pagina identica -> nenhum id novo -> para, em vez de varrer para sempre.
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });

      it('nao filtra por situacao: desativado e bloqueado tambem sincronizam', async () => {
        const svc = new GamaIspInvoicesService(redisComToken());
        paginar([
          clienteApi(1, { situacao: 'Regular' }),
          clienteApi(2, { situacao: 'Desativado' }),
          clienteApi(3, { situacao: 'Bloqueado' }),
          clienteApi(4, { situacao: 'Cortesia' }),
        ]);

        const result = await svc.fetchClients(empresa('empresa-situacao'));

        expect(result.map((c) => c.situacao)).toEqual([
          'Regular',
          'Desativado',
          'Bloqueado',
          'Cortesia',
        ]);
      });
    });

    describe('toClientUpsert — escolha do telefone', () => {
      const svc = new GamaIspInvoicesService(redisComToken());
      const alvo = empresa('empresa-map');

      it('prefere o contato WhatsApp (tipo_id 2) quando ha varios', () => {
        const mapped = svc.toClientUpsert(
          clienteApi(1, {
            contato: [
              { tipo_id: 5, tipo: 'Telefone Fixo', valor: '(11) 3000-0000' },
              { tipo_id: 1, tipo: 'Celular', valor: '(11) 91111-1111' },
              { tipo_id: 2, tipo: 'WhatsApp', valor: '(11) 92222-2222' },
            ],
          }),
          alvo,
        );

        expect(mapped?.whatsapp).toBe('11922222222');
      });

      it('cai para o Celular (tipo_id 1) quando nao ha WhatsApp', () => {
        const mapped = svc.toClientUpsert(
          clienteApi(2, {
            contato: [
              { tipo_id: 5, tipo: 'Telefone Fixo', valor: '(11) 3000-0000' },
              { tipo_id: 1, tipo: 'Celular', valor: '(11) 91111-1111' },
            ],
          }),
          alvo,
        );

        expect(mapped?.whatsapp).toBe('11911111111');
      });

      it('entra sem telefone quando so ha fixo — e NAO e descartado', () => {
        const mapped = svc.toClientUpsert(
          clienteApi(3, {
            contato: [
              { tipo_id: 5, tipo: 'Telefone Fixo', valor: '(11) 3000-0000' },
            ],
          }),
          alvo,
        );

        // Telefone fixo nao recebe mensagem, entao nao vira whatsapp; mas o
        // cliente precisa existir na base para as faturas dele nao serem
        // descartadas pelo persistSnapshot.
        expect(mapped).not.toBeNull();
        expect(mapped?.whatsapp).toBe('');
        expect(mapped?.clientId).toBe('3');
      });

      it('entra sem telefone quando o array de contato vem vazio', () => {
        const mapped = svc.toClientUpsert(clienteApi(4, { contato: [] }), alvo);
        expect(mapped?.whatsapp).toBe('');
      });

      it('descarta o cliente sem CPF/CNPJ', () => {
        expect(
          svc.toClientUpsert(clienteApi(5, { cpf_cnpj: null }), alvo),
        ).toBeNull();
      });

      it('usa o endereco de cobranca e normaliza CEP e email', () => {
        const mapped = svc.toClientUpsert(
          clienteApi(6, {
            contato: [
              { tipo_id: 2, tipo: 'WhatsApp', valor: '(11) 92222-2222' },
              { tipo_id: 3, tipo: 'Email Pessoal', valor: 'sintetico@exemplo.test' },
            ],
            endereco: { logradouro: 'RUA CADASTRAL', cep: '00000-000' },
            cobranca: {
              logradouro: 'RUA DE COBRANCA',
              numero: 42,
              cidade: 'CIDADE TESTE',
              cep: '11111-222',
            },
          }),
          alvo,
        );

        expect(mapped?.street).toBe('RUA DE COBRANCA');
        expect(mapped?.numberHouse).toBe('42');
        expect(mapped?.city).toBe('CIDADE TESTE');
        expect(mapped?.zipCode).toBe('11111222');
        expect(mapped?.email).toBe('sintetico@exemplo.test');
      });
    });

    describe('getInvoicesByDateWindowBatch', () => {
      const INICIO = '2026-01-01';
      const FIM = '2026-12-31';

      const faturaApi = (
        id: number,
        vencimento: string,
        extra: Partial<GamaIspFatura> = {},
      ): GamaIspFatura => ({
        ...(faturaAberta as GamaIspFatura),
        id,
        cliente_id: 7,
        data_vencimento: vencimento,
        ...extra,
      });

      it('indexa as faturas em aberto por cliente_id', async () => {
        const svc = new GamaIspInvoicesService(redisComToken());
        paginar([
          faturaApi(1, '2026-06-01'),
          faturaApi(2, '2026-05-01', { cliente_id: 9 }),
        ]);

        const mapa = await svc.getInvoicesByDateWindowBatch(
          empresa('empresa-batch'),
          INICIO,
          FIM,
        );

        expect([...mapa.keys()].sort()).toEqual(['7', '9']);
        expect(mapa.get('7')).toHaveLength(1);
      });

      it('PARA de paginar ao encontrar vencimento anterior a janela', async () => {
        const svc = new GamaIspInvoicesService(redisComToken());

        // Ordenado por vencimento desc: 1a pagina cheia dentro da janela; 2a
        // pagina TAMBEM cheia, mas com metade ja anterior ao inicio da janela.
        // Sem a parada, a varredura seguiria para a 3a pagina.
        const pagina1 = Array.from({ length: 100 }, (_, i) =>
          faturaApi(i + 1, '2026-06-01'),
        );
        const pagina2 = [
          ...Array.from({ length: 50 }, (_, i) => faturaApi(200 + i, '2026-02-01')),
          ...Array.from({ length: 50 }, (_, i) => faturaApi(300 + i, '2025-12-31')),
        ];
        paginar([...pagina1, ...pagina2, ...Array.from({ length: 100 }, (_, i) => faturaApi(400 + i, '2025-01-01'))]);

        const mapa = await svc.getInvoicesByDateWindowBatch(
          empresa('empresa-janela'),
          INICIO,
          FIM,
        );

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(mapa.get('7')).toHaveLength(150);
      });

      it('descarta pagas e canceladas, e ignora vencimento posterior a janela sem parar', async () => {
        const svc = new GamaIspInvoicesService(redisComToken());
        paginar([
          faturaApi(1, '2027-01-15'), // depois do fim da janela -> ignorada
          faturaApi(2, '2026-06-01', { data_pagamento: '2026-05-30' }), // paga
          faturaApi(3, '2026-05-01', { excluida: 'S' }),
          faturaApi(4, '2026-04-01', { desativada: 'S' }),
          faturaApi(5, '2026-03-01'), // unica valida
        ]);

        const mapa = await svc.getInvoicesByDateWindowBatch(
          empresa('empresa-filtro'),
          INICIO,
          FIM,
        );

        expect(mapa.get('7')).toHaveLength(1);
        expect(String(mapa.get('7')![0].id)).toBe('5');
      });

      it('usa o cache do Redis quando ja existe, sem chamar o ERP', async () => {
        const chave = 'gamaisp:invoice-batch:empresa-cache:2026-01-01:2026-12-31';
        const svc = new GamaIspInvoicesService(
          redisComToken({ [chave]: [['7', [faturaApi(1, '2026-06-01')]]] }),
        );

        const mapa = await svc.getInvoicesByDateWindowBatch(
          empresa('empresa-cache'),
          INICIO,
          FIM,
        );

        expect(fetchMock).not.toHaveBeenCalled();
        expect(mapa.get('7')).toHaveLength(1);
      });
    });

    describe('toInvoiceUpsert', () => {
      const svc = new GamaIspInvoicesService(redisComToken());
      const contexto = {
        clientId: 'client-uuid',
        companyId: 'company-uuid',
        syncTime: new Date('2026-06-10T12:00:00.000Z'),
      };

      it('grava o PIX no snapshot e mantem o link de PDF nulo', () => {
        const mapped = svc.toInvoiceUpsert(
          faturaAberta as GamaIspFatura,
          contexto,
        );

        expect(mapped).toEqual({
          id_fatura: '101',
          contractId: '55',
          value: '64.90',
          status: 'A Receber',
          // ISO cru: o projeto le os dois formatos (toBrDate, o CASE do SQL).
          expiration: VENCIDA,
          ticketDigitableLine: faturaAberta.linha_digitavel,
          ticketPdfLink: null,
          // Diferente do MK: o PIX ja veio no payload, guardar nao custa chamada.
          pixCode: faturaAberta.pix_qrcode,
          lastSyncAt: contexto.syncTime,
          clientId: 'client-uuid',
          companyId: 'company-uuid',
        });
      });

      it('retorna null quando a fatura nao tem vencimento', () => {
        expect(
          svc.toInvoiceUpsert(
            { ...(faturaAberta as GamaIspFatura), data_vencimento: null },
            contexto,
          ),
        ).toBeNull();
      });
    });
  });
});
