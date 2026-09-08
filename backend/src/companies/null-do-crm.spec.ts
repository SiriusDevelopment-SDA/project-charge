import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Repository } from 'typeorm';
import { ErpPreflightService } from '../integrations/erp/erp-preflight.service';
import { ProvisioningWebhookController } from '../webhooks/provisioning.webhook.controller';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { VincularCrmDto } from './dto/vincular-crm.dto';
import { Company } from './entities/companies';

/**
 * `null` VINDO DO CRM.
 *
 * O CRM reenvia o registro inteiro a cada alteracao, e campo que ele nao
 * preencheu viaja como `null` — nao como ausencia. Num campo de LISTA a mesma
 * ausencia chega como `[]`, e o ultimo describe deste arquivo cobre esse caso:
 * mesmo chamador, mesmo fenomeno, outro token. O `@IsOptional()` do
 * class-validator pula a validacao para `null` E para `undefined`, entao o
 * `null` atravessava o DTO intacto; ja o `companies.service.ts` decide campo a
 * campo com `if (dto.campo !== undefined)`, e `null !== undefined` e verdadeiro.
 * O `if` entrava e o metodo de string estourava:
 *
 *   TypeError: Cannot read properties of null (reading 'trim')
 *
 * Isso e HTTP 500 — erro nosso, para um payload que deveria ser 400 ou, melhor
 * ainda, seguir normalmente. O CRM nao tem como distinguir "voces caiu" de
 * "meu payload estava errado", e o operador ve a alteracao falhar sem motivo
 * legivel.
 *
 * A REGRA, e ela e diferente conforme a obrigatoriedade do campo:
 *
 * - **Opcional (PATCH)**: `null` = CAMPO NAO ENVIADO. Mantem o valor atual, a
 *   requisicao segue, sem erro. Mesma semantica que `""` ja tinha — e era
 *   justamente a inconsistencia que motivou esta correcao: `""` era ignorado
 *   com elegancia e `null` derrubava a requisicao inteira.
 * - **Obrigatorio (cadastro)**: `null` = 400 nomeando o campo. Ignorar um
 *   obrigatorio trocaria um 500 visivel por empresa criada pela metade em
 *   silencio, que e pior.
 *
 * Estes testes rodam pelo mesmo caminho do ValidationPipe global de `main.ts`
 * (`plainToInstance` + `validateSync` com whitelist) e depois entregam o DTO ao
 * service de verdade, com repositorio falso: e a unica forma de provar que o
 * `undefined` produzido no DTO sobrevive ate o `if` do service.
 */

/** Mesmas opcoes do ValidationPipe em `main.ts`. */
function validarUpdate(payload: Record<string, unknown>): {
  dto: UpdateCompanyDto;
  campos: string[];
  mensagens: string[];
} {
  const dto = plainToInstance(UpdateCompanyDto, payload);
  const erros = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  return {
    dto,
    campos: erros.map((erro) => erro.property),
    mensagens: erros.flatMap((erro) => Object.values(erro.constraints ?? {})),
  };
}

/** Idem, para o cadastro. */
function validarCreate(payload: Record<string, unknown>): {
  campos: string[];
  mensagens: string[];
} {
  const dto = plainToInstance(CreateCompanyDto, payload);
  const erros = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  return {
    campos: erros.map((erro) => erro.property),
    mensagens: erros.flatMap((erro) => Object.values(erro.constraints ?? {})),
  };
}

/**
 * A empresa como ela esta no banco ANTES do PATCH. Todo campo tem valor: e o
 * que permite afirmar "o valor atual foi preservado" em vez de so "nao
 * estourou".
 */
function empresaNoBanco(): Company {
  return {
    id: 'empresa-1',
    name: 'PROVEDOR EXEMPLO',
    url: 'erp.exemplo.com.br',
    account_chatwoot: '99',
    erp: 'IXC',
    autorization: '00:0000',
    config: {
      plano: 'cobranca',
      // Marcador do sistema: precisa sobreviver a qualquer PATCH.
      lastClientSyncAt: '2026-08-01T00:00:00.000Z',
      timeoutMs: 90000,
      order_pix_key: 'financeiro@exemplo.com.br',
      order_pix_key_type: 'EMAIL',
    },
    cnpj: '11222333000181',
    teamChargeId: '7',
    token_system_coraxy: 'token-system-atual',
    token_notificameHub: 'token-notificame-atual',
    canalId_notificameHub: [{ id: 'canal-a', numero: '+55 00 0000-0000' }],
    active: true,
  } as unknown as Company;
}

type Contexto = {
  service: CompaniesService;
  empresa: Company;
  preflightRodou: () => boolean;
  salvou: () => boolean;
};

/**
 * Service real, repositorio falso. O preflight devolve `ok` para que qualquer
 * revalidacao indevida apareca como chamada extra, e nao como falha de rede.
 */
function contexto(): Contexto {
  const empresa = empresaNoBanco();
  let salvou = false;

  const repositorio = {
    findOne: jest.fn().mockResolvedValue(empresa),
    save: jest.fn(async (e: Company) => {
      salvou = true;
      return e;
    }),
    // Busca por `crm_company_id`, usada pelo webhook. Devolve a MESMA empresa:
    // e o cenario real do PATCH do CRM, que so alcanca empresa ja vinculada.
    createQueryBuilder: jest.fn(() => ({
      where: () => ({ getOne: async () => empresa }),
    })),
  };

  const preflight = {
    run: jest.fn().mockResolvedValue({
      status: 'ok',
      causa: null,
      clientesVisiveis: 10,
      faturasVisiveis: 10,
      erro: null,
    }),
  };

  return {
    service: new CompaniesService(
      repositorio as unknown as Repository<Company>,
      preflight as unknown as ErpPreflightService,
    ),
    empresa,
    preflightRodou: () => preflight.run.mock.calls.length > 0,
    salvou: () => salvou,
  };
}

/** PATCH /companies/:id com o payload dado, passando pela validacao antes. */
async function patch(payload: Record<string, unknown>) {
  const { dto, campos, mensagens } = validarUpdate(payload);
  const ctx = contexto();
  const resposta = await ctx.service.update({ id: 'empresa-1' }, dto);

  return { ...ctx, dto, campos, mensagens, resposta };
}

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation();
  jest.spyOn(Logger.prototype, 'warn').mockImplementation();
});

afterAll(() => jest.restoreAllMocks());

/**
 * OS CINCO CAMPOS DE TEXTO QUE ESTOURAVAM.
 *
 * Cada um chega a uma linha do `companies.service.ts` que chama metodo de
 * string sem checar o tipo:
 *
 *   dto.name.trim()                  dto.cnpj.replace()
 *   dto.teamChargeId.trim()          dto.token_system_coraxy.trim()
 *   dto.token_notificameHub.trim()
 *
 * O criterio de aprovacao tem DUAS partes, e as duas importam: nao estourar
 * (a requisicao segue) e nao alterar (o valor atual continua la). Um teste que
 * so verificasse a ausencia de excecao passaria com uma "correcao" que gravasse
 * string vazia — que e o mesmo dano por outro caminho.
 */
describe('PATCH: null em campo opcional vale como campo NAO ENVIADO', () => {
  it('name: null nao estoura e preserva o nome atual', async () => {
    const { campos, empresa } = await patch({ name: null });

    expect(campos).toEqual([]);
    expect(empresa.name).toBe('PROVEDOR EXEMPLO');
  });

  it('cnpj: null nao estoura e preserva o CNPJ atual', async () => {
    // O pior desfecho silencioso deste campo: `null.replace` era 500, mas
    // gravar "" passaria no NOT NULL e apagaria a chave PIX de recebimento.
    const { campos, empresa } = await patch({ cnpj: null });

    expect(campos).toEqual([]);
    expect(empresa.cnpj).toBe('11222333000181');
  });

  it('teamChargeId: null nao estoura e preserva o time atual', async () => {
    // DECISAO: `null` NAO limpa. O campo e limpavel, mas por `""`, que continua
    // sendo o pedido explicito de limpeza. `null` aqui e o CRM reenviando o
    // registro inteiro — tratar como "limpar" desligaria o time de cobranca de
    // uma empresa sem ninguem ter pedido, e ninguem perceberia na hora.
    const { campos, empresa } = await patch({ teamChargeId: null });

    expect(campos).toEqual([]);
    expect(empresa.teamChargeId).toBe('7');
  });

  it('teamChargeId: "" continua LIMPANDO — o vazio segue sendo pedido explicito', async () => {
    const { campos, empresa } = await patch({ teamChargeId: '' });

    expect(campos).toEqual([]);
    expect(empresa.teamChargeId).toBeNull();
  });

  it('token_system_coraxy: null nao estoura e preserva o token atual', async () => {
    const { campos, empresa } = await patch({ token_system_coraxy: null });

    expect(campos).toEqual([]);
    expect(empresa.token_system_coraxy).toBe('token-system-atual');
  });

  it('token_notificameHub: null nao estoura e preserva o token atual', async () => {
    // Gravar "" aqui passaria no NOT NULL e deixaria a empresa incapaz de
    // disparar: o worker aborta com "Empresa sem integracao NotificaMe".
    const { campos, empresa } = await patch({ token_notificameHub: null });

    expect(campos).toEqual([]);
    expect(empresa.token_notificameHub).toBe('token-notificame-atual');
  });
});

/**
 * OS CAMPOS QUE O LEVANTAMENTO INICIAL NAO LISTOU.
 *
 * Os cinco acima estouram alto, e por isso foram os primeiros vistos. Estes
 * falham CALADOS, que e pior: a requisicao devolve 200 e o dano so aparece
 * depois — na proxima sincronizacao, no proximo disparo, ou na fatura de um
 * cliente que enxergou tela que nao comprou.
 */
describe('PATCH: null nos demais campos opcionais', () => {
  it('url: null nao apaga o endereco do ERP', async () => {
    // `normalizaUrl(null)` devolvia "" — a empresa ficava sem host, a
    // sincronizacao passava a bater em lugar nenhum, e a resposta era 200.
    const { campos, empresa } = await patch({ url: null });

    expect(campos).toEqual([]);
    expect(empresa.url).toBe('erp.exemplo.com.br');
  });

  it('url: null nao dispara preflight', async () => {
    // `dto.url !== undefined` era verdadeiro para null, entao o PATCH batia no
    // ERP do cliente sem que ninguem tivesse pedido revalidacao.
    const { preflightRodou } = await patch({ url: null });

    expect(preflightRodou()).toBe(false);
  });

  it('credenciais: null nao dispara preflight', async () => {
    const { preflightRodou } = await patch({ credenciais: null });

    expect(preflightRodou()).toBe(false);
  });

  it('canais: null preserva os canais atuais', async () => {
    // A coluna e `jsonb` NOT NULL com default '[]'. Gravar null nao era
    // TypeError: era erro do Postgres na hora do save — 500 tambem.
    const { campos, empresa } = await patch({ canais: null });

    expect(campos).toEqual([]);
    expect(empresa.canalId_notificameHub).toEqual([
      { id: 'canal-a', numero: '+55 00 0000-0000' },
    ]);
  });

  it('plano: null NAO remove o plano da empresa', async () => {
    // O mais caro dos silenciosos. `montarConfig` grava `plano: null` e apaga
    // as flags legadas; `resolvePagePermissions` cai no modelo antigo, onde a
    // AUSENCIA LIBERA — a empresa ganha dashboard, clientes vencidos e chat sem
    // ninguem ter vendido. O docblock do DTO ja afirmava que "null devolve
    // 400"; nao devolvia, porque o @IsOptional() pula null.
    const { campos, empresa } = await patch({ plano: null });

    expect(campos).toEqual([]);
    expect((empresa.config as Record<string, unknown>).plano).toBe('cobranca');
  });

  it('paginasExtras: null nao estoura no montarConfig', async () => {
    // `alteracoes.paginasExtras !== undefined` entrava e `null.length`
    // estourava — o sexto TypeError, fora dos cinco mapeados.
    const { campos } = await patch({ paginasExtras: null });

    expect(campos).toEqual([]);
  });

  it('pagamento.order_pix_key: null nao estoura e preserva a chave PIX', async () => {
    // `tipoPix.trim()` em `montarConfig` estourava. E a "correcao" ingenua —
    // deixar o null seguir como limpeza — apagaria a chave de recebimento de
    // quem configurou uma, e a cobranca voltaria a sair no CNPJ sem ninguem
    // notar.
    const { campos, empresa } = await patch({
      pagamento: { order_pix_key: null, order_pix_key_type: null },
    });

    expect(campos).toEqual([]);
    expect(empresa.config).toMatchObject({
      order_pix_key: 'financeiro@exemplo.com.br',
      order_pix_key_type: 'EMAIL',
    });
  });

  it('pagamento.order_pix_key: "" NAO limpa mais — mantem a chave atual', async () => {
    // MUDANCA DE REGRA, deliberada. O `""` limpava a chave e o tipo junto.
    // Agora vale como campo nao enviado, igual ao `null`: a chave de
    // recebimento e por onde o dinheiro entra, e apaga-la por causa de um vazio
    // que veio de carona num payload reenviado inteiro mandaria a cobranca para
    // o lugar errado — com 200 na resposta e ninguem sabendo.
    //
    // O preco esta registrado no docblock de `PagamentoPixDto`: a sobreposicao,
    // uma vez gravada, nao tem como ser removida por este endpoint.
    const { campos, empresa } = await patch({
      pagamento: { order_pix_key: '', order_pix_key_type: '' },
    });

    expect(campos).toEqual([]);
    expect(empresa.config).toMatchObject({
      order_pix_key: 'financeiro@exemplo.com.br',
      order_pix_key_type: 'EMAIL',
    });
  });

  it('pagamento.order_pix_key com conteudo continua sobrescrevendo', async () => {
    const { campos, empresa } = await patch({
      pagamento: {
        order_pix_key: '  5511999999999  ',
        order_pix_key_type: 'phone',
      },
    });

    expect(campos).toEqual([]);
    expect(empresa.config).toMatchObject({
      order_pix_key: '5511999999999',
      order_pix_key_type: 'PHONE',
    });
  });

  it('pagamento.order_pix_key_type fora da lista da Meta continua 400', () => {
    // Sem inferencia por formato: o tipo e o que a empresa disser, e so vale se
    // a Meta aceitar. "RANDOM" nao existe para ela — o certo e "EVP".
    expect(
      validarUpdate({ pagamento: { order_pix_key_type: 'RANDOM' } }).campos,
    ).toEqual(['pagamento']);
  });

  it('ajustes: null (o objeto inteiro) vale como ausencia', async () => {
    const { campos, empresa } = await patch({ ajustes: null });

    expect(campos).toEqual([]);
    expect((empresa.config as Record<string, unknown>).timeoutMs).toBe(90000);
  });

  it('ajustes.timeoutMs: null continua REMOVENDO o ajuste — a excecao deliberada', async () => {
    // A UNICA excecao a regra, e ela e proposital. Num campo numerico nao
    // existe `""` para pedir limpeza, entao `null` e o unico token disponivel:
    // trata-lo como ausencia deixaria um ajuste gravado sem forma suportada de
    // remover, e a saida voltaria a ser `UPDATE` manual no banco — o habito que
    // este endpoint veio encerrar. `montarConfig` ja tratava assim.
    const { campos, empresa } = await patch({ ajustes: { timeoutMs: null } });

    expect(campos).toEqual([]);
    expect(empresa.config).not.toHaveProperty('timeoutMs');
  });

  it('PATCH so com nulls nao escreve nada e cai na previa', async () => {
    // Consequencia direta de "null = campo nao enviado": o corpo inteiro vira
    // um PATCH vazio, que ja tinha uso proprio — a previa do que um PATCH real
    // removeria. `aplicado: false` e nenhuma escrita.
    const { resposta, salvou } = await patch({
      name: null,
      cnpj: null,
      teamChargeId: null,
      token_system_coraxy: null,
      token_notificameHub: null,
      url: null,
      plano: null,
      canais: null,
    });

    expect(resposta.aplicado).toBe(false);
    expect(salvou()).toBe(false);
  });

  it('o null nao atrapalha o campo que o PATCH realmente queria mudar', async () => {
    // O caso concreto: o CRM manda o registro inteiro para trocar so o nome.
    const { campos, empresa, salvou } = await patch({
      name: 'NOVO NOME',
      cnpj: null,
      teamChargeId: null,
      token_notificameHub: null,
    });

    expect(campos).toEqual([]);
    expect(empresa.name).toBe('NOVO NOME');
    expect(empresa.cnpj).toBe('11222333000181');
    expect(empresa.teamChargeId).toBe('7');
    expect(empresa.token_notificameHub).toBe('token-notificame-atual');
    expect(salvou()).toBe(true);
  });
});

/**
 * VALOR COM CONTEUDO CONTINUA VALIDADO.
 *
 * A correcao trata AUSENCIA disfarcada de valor. Ela nao afrouxa nada sobre
 * valor de verdade: CNPJ com digito verificador errado segue 400, e "" segue
 * significando o que ja significava em cada campo.
 */
describe('PATCH: a correcao do null nao afrouxa a validacao de valor', () => {
  it('cnpj com digito verificador errado continua 400', () => {
    const { campos, mensagens } = validarUpdate({ cnpj: '11222333000180' });

    expect(campos).toEqual(['cnpj']);
    expect(mensagens.join(' ')).toContain('digitos verificadores');
  });

  it('cnpj com letras continua 400', () => {
    expect(validarUpdate({ cnpj: 'abc' }).campos).toEqual(['cnpj']);
  });

  it('name vazio continua 400 — so o null virou ausencia', () => {
    expect(validarUpdate({ name: '' }).campos).toEqual(['name']);
  });

  it('token_system_coraxy vazio continua 400', () => {
    expect(validarUpdate({ token_system_coraxy: '' }).campos).toEqual([
      'token_system_coraxy',
    ]);
  });

  it('plano fora da lista continua 400', () => {
    expect(validarUpdate({ plano: 'premium' }).campos).toEqual(['plano']);
    expect(validarUpdate({ plano: '' }).campos).toEqual(['plano']);
  });

  it('cnpj e token_notificameHub vazios seguem valendo como ausencia', () => {
    const { dto } = validarUpdate({ cnpj: '  ', token_notificameHub: '' });

    expect(dto.cnpj).toBeUndefined();
    expect(dto.token_notificameHub).toBeUndefined();
  });
});

/**
 * `"   "` E CAMPO VAZIO, E NAO ERA.
 *
 * O `@IsNotEmpty()` do class-validator reprova `""`, `null` e `undefined` — e
 * so isso. Espaco em branco passava inteiro por ele e chegava ao service, que
 * gravava o resultado do `.trim()`: nome de empresa VAZIO, host de ERP VAZIO,
 * token do Maestro VAZIO. Nenhum erro, 200 na resposta, e o estropio so
 * aparecia depois — empresa sem nome na lista, sincronizacao batendo em host
 * nenhum, webhook de agentes recusando a empresa inteira.
 *
 * O conserto e o `trim` que o `@CampoOpcional()` (e o `textoAparado` solto, no
 * cadastro) fazem ANTES da validacao: o espaco chega ao `@IsNotEmpty()` como
 * vazio e e recusado nomeando o campo. O valor GRAVADO nao muda — o service ja
 * aparava depois. O que mudou foi a ordem, e com ela a chance de gravar vazio.
 */
describe('PATCH: espaco em branco nao passa mais por campo obrigatorio', () => {
  for (const campo of [
    'name',
    'url',
    'token_system_coraxy',
    'crm_company_id',
  ]) {
    it(`${campo}: "   " e recusado como vazio`, () => {
      expect(validarUpdate({ [campo]: '   ' }).campos).toEqual([campo]);
    });
  }

  it('valor de verdade cercado de espacos e aceito, ja aparado', async () => {
    // O trim nao serve para recusar: serve para nao gravar vazio. Quem mandou
    // conteudo com espaco em volta queria o conteudo.
    const { campos, empresa } = await patch({ name: '  NOVO NOME  ' });

    expect(campos).toEqual([]);
    expect(empresa.name).toBe('NOVO NOME');
  });

  it('teamChargeId: "   " continua limpando, como o "" sempre fez', async () => {
    // Aqui o vazio e pedido legitimo, entao aparar nao muda o desfecho — so
    // torna os dois vazios indistinguiveis, que e o que eles sempre foram.
    const { campos, empresa } = await patch({ teamChargeId: '   ' });

    expect(campos).toEqual([]);
    expect(empresa.teamChargeId).toBeNull();
  });
});

/**
 * `canais: []` — A AUSENCIA NUM CAMPO DE LISTA.
 *
 * Mora neste arquivo porque e o MESMO fenomeno dos testes acima: o chamador de
 * maquina que reenvia o registro inteiro e serializa como vazio o campo que ele
 * nao tem preenchido. Muda so o token — `[]` em vez de `null`, porque o campo e
 * uma lista.
 *
 * A ASSIMETRIA QUE ISTO FECHA
 *
 * `CreateCompanyDto` tem `@ArrayNotEmpty()`: empresa nao NASCE sem canal. O
 * PATCH so tinha `@IsArray()`, entao aceitava `[]` e esvaziava a lista — a
 * empresa nao podia nascer sem canal, mas podia FICAR sem, por um PATCH que
 * ninguem leu como pedido.
 *
 * E o estrago nao aparece na resposta: 200. O canal e o remetente (`from`) do
 * disparo, entao a empresa so quebra na hora do envio, e mensagem por mensagem
 * — o `MessageQueueWorker` aborta cada uma com "Empresa sem integracao
 * NotificaMe configurada". Nao falha no PATCH, nao falha na campanha.
 *
 * O NOT NULL da coluna nao ajuda: `canalId_notificameHub` e `jsonb` com default
 * `'[]'`, e array vazio satisfaz a constraint.
 */
describe('PATCH: canais nao pode ser esvaziado', () => {
  const canaisAtuais = [{ id: 'canal-a', numero: '+55 00 0000-0000' }];

  it('canais: [] vale como campo nao enviado — os canais atuais permanecem', async () => {
    const { campos, empresa } = await patch({ canais: [] });

    expect(campos).toEqual([]);
    expect(empresa.canalId_notificameHub).toEqual(canaisAtuais);
  });

  it('canais: [] sozinho nao escreve nada e cai na previa', async () => {
    // Consequencia de virar `undefined` no DTO: o corpo inteiro fica sem campo
    // algum, e o service nem chega ao `save`.
    const { resposta, salvou } = await patch({ canais: [] });

    expect(resposta.aplicado).toBe(false);
    expect(salvou()).toBe(false);
  });

  it('canais: [] nao atrapalha o campo que o PATCH realmente queria mudar', async () => {
    const { campos, empresa, salvou } = await patch({
      name: 'NOVO NOME',
      canais: [],
    });

    expect(campos).toEqual([]);
    expect(empresa.name).toBe('NOVO NOME');
    expect(empresa.canalId_notificameHub).toEqual(canaisAtuais);
    expect(salvou()).toBe(true);
  });

  it('lista COM conteudo continua substituindo a atual por completo', async () => {
    // O `[]` virar ausencia nao pode custar a troca de canal, que e a razao de
    // o campo existir no PATCH.
    const novos = [
      { id: 'canal-b', numero: '+55 11 1111-1111' },
      { id: 'canal-c', numero: '+55 22 2222-2222' },
    ];
    const { campos, empresa } = await patch({ canais: novos });

    expect(campos).toEqual([]);
    expect(empresa.canalId_notificameHub).toEqual(novos);
  });

  it('item sem id continua 400 — o transform nao afrouxa o @ValidateNested', () => {
    expect(validarUpdate({ canais: [{ numero: '+55 00 0000-0000' }] }).campos).toEqual([
      'canais',
    ]);
  });

  it('item sem numero continua 400', () => {
    expect(validarUpdate({ canais: [{ id: 'canal-a' }] }).campos).toEqual([
      'canais',
    ]);
  });

  it('canais que nao e lista continua 400', () => {
    // O transform devolve intacto tudo que nao e array vazio, entao o
    // `@IsArray()` do campo segue sendo quem recusa.
    expect(validarUpdate({ canais: 'canal-a' }).campos).toEqual(['canais']);
  });

  it('CADASTRO continua recusando lista vazia — a assimetria acabou pelo lado certo', () => {
    // O outro lado da correcao: o PATCH parou de esvaziar, e o cadastro NAO
    // afrouxou. Empresa continua sem poder nascer sem canal.
    const { campos } = validarCreate({
      name: 'PROVEDOR EXEMPLO',
      url: 'erp.exemplo.com.br',
      account_chatwoot: '99',
      erp: 'IXC',
      credenciais: { autorization: '00:0000' },
      plano: 'cobranca',
      token_system_coraxy: 'token-da-empresa-aqui',
      cnpj: '11222333000181',
      token_notificameHub: 'x-api-token-ficticio',
      canais: [],
    });

    expect(campos).toEqual(['canais']);
  });
});

/**
 * CADASTRO: `null` EM CAMPO OBRIGATORIO E 400, NUNCA "IGNORAR".
 *
 * No PATCH existe valor anterior a preservar; aqui nao existe. Ignorar um
 * obrigatorio criaria empresa pela metade em silencio — o modo de falha que
 * tornou `cnpj`, `token_notificameHub` e `canais` obrigatorios em primeiro
 * lugar: a falta nao aparece no cadastro, aparece na primeira campanha.
 */
describe('POST /companies: null em campo obrigatorio devolve 400 nomeando o campo', () => {
  const cadastroValido = (
    sobrescreve: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    name: 'PROVEDOR EXEMPLO',
    url: 'erp.exemplo.com.br',
    account_chatwoot: '99',
    erp: 'IXC',
    credenciais: { autorization: '00:0000' },
    plano: 'cobranca',
    token_system_coraxy: 'token-da-empresa-aqui',
    cnpj: '11222333000181',
    token_notificameHub: 'x-api-token-ficticio',
    canais: [{ id: 'canal-a', numero: '+55 00 0000-0000' }],
    ...sobrescreve,
  });

  const obrigatorios = [
    'name',
    'url',
    'account_chatwoot',
    'erp',
    'credenciais',
    'plano',
    'token_system_coraxy',
    'cnpj',
    'token_notificameHub',
    'canais',
  ];

  for (const campo of obrigatorios) {
    it(`${campo}: null e recusado, e a mensagem nomeia o campo`, () => {
      const { campos } = validarCreate(cadastroValido({ [campo]: null }));

      expect(campos).toEqual([campo]);
    });
  }

  it('os opcionais do cadastro aceitam null sem quebrar', () => {
    // `paginasExtras`, `crm_company_id` e `teamChargeId` sao os unicos
    // opcionais aqui, e o `create()` ja os le com `?.` — null nunca chegou a
    // estourar neste caminho.
    expect(
      validarCreate(
        cadastroValido({
          paginasExtras: null,
          crm_company_id: null,
          teamChargeId: null,
        }),
      ).campos,
    ).toEqual([]);
  });
});

/**
 * O TERCEIRO ENDPOINT DO CRM: `POST /webhooks/companies/vincular`.
 *
 * Nao precisou de correcao, e estes testes existem para registrar POR QUE: no
 * `VincularCrmDto` nao ha um unico campo opcional. `vinculos`,
 * `account_chatwoot` e `crm_company_id` sao todos obrigatorios, entao nenhum
 * deles tem `@IsOptional()` para o `null` atravessar — a recusa vem do proprio
 * `@IsArray()`/`@IsString()`, exatamente como deve ser em campo obrigatorio.
 *
 * Vale como trava: se algum destes campos virar opcional um dia, o
 * `vincularCrm()` faz `item.account_chatwoot.trim()` sem checar tipo, e o
 * defeito reaparece identico ao do PATCH.
 */
describe('POST /webhooks/companies/vincular: null e 400 em todo campo', () => {
  const validarVincular = (payload: Record<string, unknown>): string[] =>
    validateSync(plainToInstance(VincularCrmDto, payload), {
      whitelist: true,
      forbidNonWhitelisted: true,
    }).map((erro) => erro.property);

  it('recusa a lista nula', () => {
    expect(validarVincular({ vinculos: null })).toEqual(['vinculos']);
  });

  it('recusa item nulo dentro da lista', () => {
    expect(validarVincular({ vinculos: [null] })).toEqual(['vinculos']);
  });

  it('recusa account_chatwoot e crm_company_id nulos', () => {
    expect(
      validarVincular({
        vinculos: [{ account_chatwoot: null, crm_company_id: 'CRM-0001' }],
      }),
    ).toEqual(['vinculos']);
    expect(
      validarVincular({
        vinculos: [{ account_chatwoot: '99', crm_company_id: null }],
      }),
    ).toEqual(['vinculos']);
  });
});

/**
 * O WEBHOOK DO CRM E O CHAMADOR QUE MOTIVOU TUDO ISTO.
 *
 * `PATCH /webhooks/companies/:crmCompanyId` recusa `crm_company_id` no corpo —
 * por seguranca, para que ninguem com o `PROVISIONING_TOKEN` reponte o vinculo
 * de uma empresa existente. A guarda e `dto.crm_company_id !== undefined`, que
 * dizia sim para `null`: o CRM reenviando o registro inteiro recebia 400
 * acusando uma alteracao de vinculo que ele nao pediu, e a mensagem mandava
 * usar outro endpoint que tambem nao resolveria nada.
 */
describe('Webhook do CRM: crm_company_id null nao e tentativa de repontar vinculo', () => {
  function webhook() {
    const ctx = contexto();
    const controller = new ProvisioningWebhookController(ctx.service, {
      get: () => 'segredo-de-provisionamento',
    } as unknown as ConfigService);

    return { controller, ...ctx };
  }

  it('aceita o payload com crm_company_id: null e altera o que foi pedido', async () => {
    const { controller, empresa } = webhook();
    const { dto } = validarUpdate({ name: 'NOVO NOME', crm_company_id: null });

    await expect(
      controller.alterar('segredo-de-provisionamento', 'CRM-0001', dto),
    ).resolves.toMatchObject({ aplicado: true });

    expect(empresa.name).toBe('NOVO NOME');
  });

  it('continua recusando crm_company_id COM conteudo', async () => {
    const { controller } = webhook();
    const { dto } = validarUpdate({ crm_company_id: 'CRM-9999' });

    await expect(
      controller.alterar('segredo-de-provisionamento', 'CRM-0001', dto),
    ).rejects.toThrow('crm_company_id nao pode ser alterado');
  });
});
