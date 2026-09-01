import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ProvisioningWebhookController } from '../../webhooks/provisioning.webhook.controller';
import { CreateCompanyDto } from './create-company.dto';
import { UpdateCompanyDto } from './update-company.dto';

/**
 * Os campos que o disparo de template consome, exigidos no CADASTRO.
 *
 * `cnpj`, `token_notificameHub` e `canais` eram opcionais. A falta de qualquer
 * um deles nao aparecia no cadastro — aparecia na primeira campanha, como
 * mensagem que nunca chega: o worker aborta sem token, nao ha `from` sem canal,
 * e sem CNPJ o botao PIX sai sem `key` e a Meta recusa DEPOIS do `queued`.
 *
 * Os testes rodam pelo mesmo caminho do ValidationPipe global de `main.ts`
 * (`plainToInstance` + `validateSync` com whitelist), e nao chamando o validador
 * direto: e a passagem por `plainToInstance` que aplica os `@Transform`, e um
 * teste que pulasse isso validaria um objeto que a API nunca ve.
 */

/** Mesmas opcoes do ValidationPipe em `main.ts`. */
function validar(
  payload: Record<string, unknown>,
): { campos: string[]; mensagens: string[] } {
  const dto = plainToInstance(CreateCompanyDto, payload);
  const erros = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  return {
    campos: erros.map((erro) => erro.property),
    mensagens: erros.flatMap((erro) =>
      Object.values(erro.constraints ?? {}),
    ),
  };
}

/**
 * Cadastro valido. O ERP e o IXC por ter a credencial mais simples — o alvo
 * destes testes sao os tres campos do disparo, nao a credencial.
 *
 * Valores ficticios: `11222333000181` e o CNPJ de teste ja usado em
 * `config.contract.spec.ts`.
 */
function cadastroValido(
  sobrescreve: Record<string, unknown> = {},
): Record<string, unknown> {
  const base: Record<string, unknown> = {
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
  };

  return { ...base, ...sobrescreve };
}

/** Remove uma chave do payload, simulando campo nao enviado. */
function cadastroSem(campo: string): Record<string, unknown> {
  const payload = cadastroValido();
  delete payload[campo];
  return payload;
}

describe('CreateCompanyDto: cadastro completo', () => {
  it('aceita o payload com os tres campos do disparo preenchidos', () => {
    expect(validar(cadastroValido()).campos).toEqual([]);
  });

  it('os tres campos sobrevivem ao whitelist e chegam ao service', () => {
    // `whitelist: true` APAGA do objeto toda propriedade sem decorator de
    // validacao. Se algum dos tres perder o seu, a requisicao passaria a
    // validar e o service gravaria NULL — que e exatamente o que o NOT NULL da
    // migration existe para impedir. O CNPJ chega CRU (com pontuacao): quem
    // normaliza para gravar e o `companies.service.ts`.
    const dto = plainToInstance(
      CreateCompanyDto,
      cadastroValido({
        cnpj: '11.222.333/0001-81',
        token_notificameHub: '  x-api-token-ficticio  ',
      }),
    );
    validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });

    expect(dto.cnpj).toBe('11.222.333/0001-81');
    expect(dto.token_notificameHub).toBe('x-api-token-ficticio');
    expect(dto.canais).toHaveLength(1);
  });
});

/**
 * `"   "` NO CADASTRO E CAMPO VAZIO.
 *
 * O `@IsNotEmpty()` so reprova `""`, `null` e `undefined`. Espaco em branco
 * passava por ele e a empresa nascia com o campo VAZIO — `name` vazio some da
 * lista, `url` vazio faz a sincronizacao bater em host nenhum, e
 * `account_chatwoot` vazio e pior: e chave de unicidade, entao a SEGUNDA
 * empresa cadastrada assim colidiria com a primeira por um valor que ninguem
 * digitou.
 *
 * O `@Transform(textoAparado)` apara antes da validacao. O valor gravado nao
 * muda (o service ja aparava depois) — mudou a ordem, e com ela a chance de
 * gravar vazio.
 */
describe('CreateCompanyDto: espaco em branco nao passa por campo obrigatorio', () => {
  for (const campo of [
    'name',
    'url',
    'account_chatwoot',
    'token_system_coraxy',
    'token_notificameHub',
  ]) {
    it(`${campo}: "   " e recusado como vazio`, () => {
      expect(validar(cadastroValido({ [campo]: '   ' })).campos).toEqual([
        campo,
      ]);
    });
  }

  it('valor com conteudo cercado de espacos e aceito, ja aparado', () => {
    const dto = plainToInstance(
      CreateCompanyDto,
      cadastroValido({ name: '  PROVEDOR EXEMPLO  ', url: ' erp.exemplo.com.br ' }),
    );

    expect(
      validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
    expect(dto.name).toBe('PROVEDOR EXEMPLO');
    expect(dto.url).toBe('erp.exemplo.com.br');
  });
});

describe('CreateCompanyDto: cnpj', () => {
  it('aceita CNPJ com pontuacao — a pontuacao e ignorada na validacao', () => {
    expect(validar(cadastroValido({ cnpj: '11.222.333/0001-81' })).campos).toEqual(
      [],
    );
  });

  it('recusa CNPJ com menos de 14 digitos', () => {
    const { campos, mensagens } = validar(cadastroValido({ cnpj: '123' }));

    expect(campos).toEqual(['cnpj']);
    expect(mensagens.join(' ')).toContain('14 digitos');
  });

  it('recusa CNPJ com letras, sem confundir com campo ausente', () => {
    const { campos, mensagens } = validar(cadastroValido({ cnpj: 'abc' }));

    expect(campos).toEqual(['cnpj']);
    // A mensagem precisa falar de digitos, e NAO de campo obrigatorio: quem
    // digitou letra enviou algo, e "cnpj e obrigatorio" nao ajudaria a corrigir.
    expect(mensagens.join(' ')).toContain('14 digitos');
    expect(mensagens.join(' ')).not.toContain('obrigatorio');
  });

  it('recusa CNPJ ausente', () => {
    const { campos, mensagens } = validar(cadastroSem('cnpj'));

    expect(campos).toEqual(['cnpj']);
    expect(mensagens.join(' ')).toContain('obrigatorio');
  });

  it('recusa CNPJ vazio', () => {
    expect(validar(cadastroValido({ cnpj: '   ' })).campos).toEqual(['cnpj']);
  });

  it('recusa CNPJ com 14 digitos e digito verificador errado', () => {
    const { campos, mensagens } = validar(
      cadastroValido({ cnpj: '11222333000180' }),
    );

    expect(campos).toEqual(['cnpj']);
    expect(mensagens.join(' ')).toContain('digitos verificadores');
  });

  it('recusa a sequencia repetida, que passa no calculo do DV', () => {
    // `00000000000000` e o placeholder mais provavel e satisfaz o DV: a soma
    // ponderada de 14 zeros da zero, e o DV esperado tambem. Sem a recusa
    // explicita ele entraria como CNPJ valido e viraria chave PIX.
    expect(validar(cadastroValido({ cnpj: '00000000000000' })).campos).toEqual([
      'cnpj',
    ]);
    expect(validar(cadastroValido({ cnpj: '11111111111111' })).campos).toEqual([
      'cnpj',
    ]);
  });

  it('recusa CNPJ enviado como numero, que perderia o zero a esquerda', () => {
    expect(validar(cadastroValido({ cnpj: 11222333000181 })).campos).toEqual([
      'cnpj',
    ]);
  });
});

describe('CreateCompanyDto: token_notificameHub', () => {
  it('recusa token ausente', () => {
    const { campos, mensagens } = validar(cadastroSem('token_notificameHub'));

    expect(campos).toEqual(['token_notificameHub']);
    expect(mensagens.join(' ')).toContain('obrigatorio');
  });

  it('recusa token vazio', () => {
    expect(
      validar(cadastroValido({ token_notificameHub: '' })).campos,
    ).toEqual(['token_notificameHub']);
  });

  it('recusa token so com espacos — o trim acontece antes da validacao', () => {
    // Sem o `@Transform`, "   " passaria no @IsNotEmpty e o service gravaria
    // NULL (`.trim() || undefined`), violando o NOT NULL da coluna.
    expect(
      validar(cadastroValido({ token_notificameHub: '   ' })).campos,
    ).toEqual(['token_notificameHub']);
  });
});

describe('CreateCompanyDto: canais', () => {
  it('recusa lista de canais vazia', () => {
    const { campos, mensagens } = validar(cadastroValido({ canais: [] }));

    expect(campos).toEqual(['canais']);
    expect(mensagens.join(' ')).toContain('ao menos um canal');
  });

  it('recusa canais ausente', () => {
    expect(validar(cadastroSem('canais')).campos).toEqual(['canais']);
  });

  it('continua exigindo id em cada canal', () => {
    expect(
      validar(cadastroValido({ canais: [{ id: '', numero: '+55 00 0000-0000' }] }))
        .campos,
    ).toEqual(['canais']);
  });
});

/** Mesmo caminho do `validar`, para o DTO de alteracao. */
function validarUpdate(payload: Record<string, unknown>): {
  campos: string[];
  mensagens: string[];
} {
  const dto = plainToInstance(UpdateCompanyDto, payload);
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
 * A alteracao de empresa NAO herda a obrigatoriedade do cadastro.
 *
 * Exigir CNPJ em todo PATCH transformaria "renomear a empresa" em "reenviar o
 * cadastro inteiro", e quebraria o CRM, que altera campo a campo.
 */
describe('UpdateCompanyDto: PATCH nao passa a exigir os campos do cadastro', () => {
  it('aceita alterar so o nome, sem cnpj, token nem canais', () => {
    const dto = plainToInstance(UpdateCompanyDto, { name: 'NOVO NOME' });

    expect(
      validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
  });

  it('aceita um PATCH vazio', () => {
    const dto = plainToInstance(UpdateCompanyDto, {});

    expect(
      validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
  });
});

/**
 * LIXO E 400; VAZIO E "CAMPO NAO ENVIADO".
 *
 * O PATCH deixava `cnpj` como `@IsOptional() @IsString()` puro — sem validacao
 * de formato. `companies.service.ts` grava `dto.cnpj.replace(/\D/g, '')`, entao
 * `{"cnpj": "abc"}` era gravado como STRING VAZIA: passava no NOT NULL da
 * migration e apagava a chave PIX de recebimento da empresa sem erro nenhum.
 * `resolverChavePix` passava a devolver `null` e o botao de pagamento sumia do
 * template — descoberto so na cobranca que nunca chegou.
 *
 * A correcao usa o MESMO `CnpjValidoConstraint` do cadastro, e o campo segue
 * opcional. Os dois desfechos, que estes testes separam:
 *
 * - valor COM conteudo e invalido ("abc", DV errado, 13 digitos) -> 400;
 * - valor VAZIO ("", "   ") -> vira `undefined` no `@Transform` e vale como
 *   campo nao enviado, mantendo o CNPJ atual sem erro.
 *
 * O vazio nao e 400 porque limpar esses campos nunca foi possivel (coluna NOT
 * NULL), entao nao ha pedido legitimo sendo recusado — so o CRM reenviando o
 * payload inteiro.
 */
describe('UpdateCompanyDto: cnpj', () => {
  it('aceita CNPJ valido', () => {
    expect(validarUpdate({ cnpj: '11222333000181' }).campos).toEqual([]);
  });

  it('aceita CNPJ com pontuacao e o entrega CRU ao service', () => {
    // Quem normaliza para gravar e o `companies.service.ts`, que ja fazia
    // `replace(/\D/g, '')` antes desta mudanca. Nao ha `@Transform` limpando o
    // campo aqui — se houvesse, "abc" chegaria ao validador como "" e o
    // operador que digitou letra receberia "cnpj e obrigatorio".
    const dto = plainToInstance(UpdateCompanyDto, {
      cnpj: '11.222.333/0001-81',
    });

    expect(
      validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
    expect(dto.cnpj).toBe('11.222.333/0001-81');
  });

  it('recusa CNPJ com letras — o bug que gravava string vazia', () => {
    const { campos, mensagens } = validarUpdate({ cnpj: 'abc' });

    expect(campos).toEqual(['cnpj']);
    expect(mensagens.join(' ')).toContain('14 digitos');
  });

  it('recusa CNPJ com menos de 14 digitos', () => {
    expect(validarUpdate({ cnpj: '123' }).campos).toEqual(['cnpj']);
  });

  it('recusa CNPJ com digito verificador errado', () => {
    const { campos, mensagens } = validarUpdate({ cnpj: '11222333000180' });

    expect(campos).toEqual(['cnpj']);
    expect(mensagens.join(' ')).toContain('digitos verificadores');
  });

  it('recusa a sequencia repetida, que passa no calculo do DV', () => {
    expect(validarUpdate({ cnpj: '00000000000000' }).campos).toEqual(['cnpj']);
  });

  it('recusa CNPJ enviado como numero, que perderia o zero a esquerda', () => {
    expect(validarUpdate({ cnpj: 11222333000181 }).campos).toEqual(['cnpj']);
  });

  it('aceita "" e trata como campo NAO ENVIADO', () => {
    // A DECISAO sobre `""`: nao e 400 e nao limpa — e ignorado.
    //
    // Limpar esses campos ja era impossivel por desenho (coluna NOT NULL, e a
    // migration trata `btrim(col) = ''` como coluna FALTANDO), entao nao existe
    // intencao legitima de "limpar" para preservar: um vazio aqui so pode ser
    // ruido do CRM, que reenvia o payload inteiro. Recusa-lo faria um PATCH que
    // existe para trocar `name` falhar por causa de um `cnpj: ""` que veio de
    // carona.
    //
    // `undefined` e o resultado exigido, nao so "sem erro": e ele que faz o
    // `companies.service.ts` pular a coluna no `if (dto.cnpj !== undefined)`.
    for (const vazio of ['', '   ', '\t\n']) {
      const dto = plainToInstance(UpdateCompanyDto, { cnpj: vazio });

      expect(
        validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }),
      ).toEqual([]);
      expect(dto.cnpj).toBeUndefined();
    }
  });

  it('o vazio nao atrapalha o campo que o PATCH realmente queria mudar', () => {
    // O caso concreto que motivou a regra: CRM manda o registro inteiro para
    // trocar so o nome. Com recusa, a requisicao inteira falharia.
    const dto = plainToInstance(UpdateCompanyDto, {
      name: 'NOVO NOME',
      cnpj: '',
      token_notificameHub: '',
    });

    expect(
      validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
    expect(dto.name).toBe('NOVO NOME');
    expect(dto.cnpj).toBeUndefined();
    expect(dto.token_notificameHub).toBeUndefined();
  });

  it('o @Transform roda ANTES do validador — o vazio nunca chega ao CnpjValidoConstraint', () => {
    // A ordem e o ponto frágil da implementacao. Se o `@Transform` rodasse
    // depois, `CnpjValidoConstraint` receberia "" e reprovaria com "encontrei 0
    // digitos" — exatamente o 400 que esta regra existe para nao dar. Quem
    // garante a ordem e o pipeline: `plainToInstance` aplica os `@Transform` e
    // so o objeto resultante vai para `validateSync`, que e o que o
    // ValidationPipe de `main.ts` faz.
    const dto = plainToInstance(UpdateCompanyDto, { cnpj: '   ' });

    // Ja transformado antes de qualquer validacao rodar.
    expect(dto.cnpj).toBeUndefined();

    const mensagens = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    }).flatMap((erro) => Object.values(erro.constraints ?? {}));

    expect(mensagens.join(' ')).not.toContain('0 digitos');
    expect(mensagens).toEqual([]);
  });

  it('espacos em volta de um CNPJ com conteudo nao invalidam o valor', () => {
    const dto = plainToInstance(UpdateCompanyDto, {
      cnpj: '  11.222.333/0001-81  ',
    });

    expect(
      validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
    // Segue CRU quanto a pontuacao: quem remove os nao-digitos e o service.
    expect(dto.cnpj).toBe('11.222.333/0001-81');
  });

  it('omitir o cnpj continua aceito — nao virou obrigatorio no PATCH', () => {
    expect(validarUpdate({ name: 'NOVO NOME' }).campos).toEqual([]);
  });
});

/**
 * `token_notificameHub` tinha o MESMO buraco do `cnpj`, com desfecho diferente:
 * o service faz `dto.token_notificameHub.trim()`, entao `""` e `"   "` eram
 * gravados como string vazia. Passa no NOT NULL, e o worker de disparo aborta
 * toda mensagem da empresa com "Empresa sem integracao NotificaMe configurada".
 *
 * Fechado pelo mesmo `vazioComoAusente`: o vazio vira `undefined` e o service
 * nao encosta na coluna. Nao ha `@IsNotEmpty()` aqui de proposito — depois do
 * transform o valor so pode ser `undefined` ou string com conteudo, entao o
 * decorator seria inalcancavel e sugeriria uma recusa que nao acontece.
 */
describe('UpdateCompanyDto: token_notificameHub', () => {
  it('aceita token valido e entrega ja trimado', () => {
    const dto = plainToInstance(UpdateCompanyDto, {
      token_notificameHub: '  x-api-token-ficticio  ',
    });

    expect(
      validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
    expect(dto.token_notificameHub).toBe('x-api-token-ficticio');
  });

  it('aceita "" e so espacos, tratando como campo NAO ENVIADO', () => {
    // Mesma regra do `cnpj`. Sem o `@Transform`, "   " chegaria ao service e
    // viraria "" no `.trim()`, gravando um token vazio que satisfaz o NOT NULL
    // e deixa a empresa incapaz de disparar. Virar `undefined` faz o service
    // nao encostar na coluna.
    for (const vazio of ['', '   ']) {
      const dto = plainToInstance(UpdateCompanyDto, {
        token_notificameHub: vazio,
      });

      expect(
        validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }),
      ).toEqual([]);
      expect(dto.token_notificameHub).toBeUndefined();
    }
  });

  it('recusa token que nao e texto', () => {
    expect(validarUpdate({ token_notificameHub: 123 }).campos).toEqual([
      'token_notificameHub',
    ]);
  });

  it('omitir o token continua aceito', () => {
    expect(validarUpdate({ name: 'NOVO NOME' }).campos).toEqual([]);
  });
});

/**
 * O provisionamento pelo CRM usa os MESMOS DTOs do endpoint humano.
 *
 * Nao existe DTO reduzido para o chamador de maquina, e isso e deliberado: dois
 * contratos para a mesma operacao virariam duas regras de negocio divergentes.
 * `POST /webhooks/companies` recebe `CreateCompanyDto`, entao os tres campos do
 * disparo passaram a ser obrigatorios LA no mesmo commit, sem ninguem ter
 * editado o controller — e todos os testes acima valem para ele.
 *
 * Este teste existe para travar essa decisao. Se alguem introduzir um
 * `ProvisionCompanyDto` com regras mais frouxas para desbloquear o CRM, ele
 * quebra e forca a conversa em vez de deixar o provisionamento aceitar em
 * silencio a empresa que nasce sem chave PIX.
 */
describe('Webhook de provisionamento: contrato', () => {
  it('POST /webhooks/companies recebe o mesmo CreateCompanyDto do endpoint humano', () => {
    const tipos: unknown[] = Reflect.getMetadata(
      'design:paramtypes',
      ProvisioningWebhookController.prototype,
      'provisionar',
    );

    expect(tipos).toContain(CreateCompanyDto);
  });

  it('PATCH /webhooks/companies/:crmCompanyId recebe o mesmo UpdateCompanyDto', () => {
    // Consequencia direta: a recusa de `cnpj` invalido e de `""` vale tambem
    // para o CRM, que era o outro caminho para gravar CNPJ vazio.
    const tipos: unknown[] = Reflect.getMetadata(
      'design:paramtypes',
      ProvisioningWebhookController.prototype,
      'alterar',
    );

    expect(tipos).toContain(UpdateCompanyDto);
  });
});

/**
 * O `undefined` produzido pelo `vazioComoAusente` precisa sobreviver ate o
 * service, e ha UM ponto do `companies.service.ts` que olha o dto inteiro em vez
 * de campo a campo:
 *
 *   const pediuAlteracao = Object.values(dto).some((v) => v !== undefined);
 *
 * E a guarda do "PATCH vazio nao escreve nada" — sem ela, um corpo vazio passaria
 * pelo `montarConfig` e removeria as chaves fora do contrato de uma empresa sem
 * ninguem ter pedido.
 *
 * A interacao com a nova regra e desejada, mas nao e obvia: um PATCH que so
 * manda `cnpj: ""` vira um PATCH SEM NENHUM CAMPO e cai na previa (`aplicado:
 * false`), em vez de escrever. Nada e alterado e a resposta diz isso — que e
 * exatamente o que "vazio vale como campo nao enviado" deveria significar.
 */
describe('UpdateCompanyDto: o vazio chega ao service como ausencia', () => {
  /** Reproduz a guarda do `companies.service.ts`. */
  const pediuAlteracao = (dto: UpdateCompanyDto): boolean =>
    Object.values(dto).some((v) => v !== undefined);

  it('PATCH so com campos vazios nao pede alteracao nenhuma', () => {
    const dto = plainToInstance(UpdateCompanyDto, {
      cnpj: '',
      token_notificameHub: '   ',
    });

    expect(pediuAlteracao(dto)).toBe(false);
  });

  it('PATCH com um campo real segue pedindo alteracao, mesmo com vazios junto', () => {
    const dto = plainToInstance(UpdateCompanyDto, {
      name: 'NOVO NOME',
      cnpj: '',
    });

    expect(pediuAlteracao(dto)).toBe(true);
  });

  it('CNPJ com conteudo continua pedindo alteracao', () => {
    const dto = plainToInstance(UpdateCompanyDto, { cnpj: '11222333000181' });

    expect(pediuAlteracao(dto)).toBe(true);
  });
});
