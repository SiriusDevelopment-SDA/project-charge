import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PAGINAS_IDS, PLANOS } from '../planos';
import { CanalNotificameDto } from './create-company.dto';

/**
 * Ajustes finos de comunicacao com o ERP.
 *
 * Existem porque nem todo ERP aguenta o padrao: a ADRENALINA, por exemplo,
 * comeca a estourar timeout a partir da pagina ~50 com a concorrencia padrao de
 * 5. Ate aqui, baixar isso exigia `UPDATE` manual no `config` — que e
 * exatamente o habito que este endpoint veio encerrar.
 */
export class AjustesErpDto {
  @ApiPropertyOptional({
    description: 'Timeout de cada chamada ao ERP, em milissegundos.',
    minimum: 1000,
    maximum: 600000,
    example: 90000,
  })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(600000)
  timeoutMs?: number;

  @ApiPropertyOptional({
    description: 'Quantas vezes repetir uma chamada que falhou por rede.',
    minimum: 0,
    maximum: 10,
    example: 3,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  retries?: number;

  @ApiPropertyOptional({
    description:
      'Paginas de clientes buscadas em paralelo (SGP). Baixe para 1 ou 2 em ERP que estoura timeout.',
    minimum: 1,
    maximum: 20,
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  clientsConcurrency?: number;

  @ApiPropertyOptional({
    description: 'Faturas buscadas em paralelo (MK).',
    minimum: 1,
    maximum: 20,
    example: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  invoicesConcurrency?: number;
}

/**
 * Alteracao de empresa ja cadastrada.
 *
 * ATENCAO AO EDITAR: os `example` aparecem na documentacao Swagger. Use somente
 * valores ficticios — nunca host, CNPJ, telefone ou token de cliente real.
 *
 * Este endpoint existe para encerrar o `UPDATE` manual no banco. Enquanto a
 * unica forma de alterar uma empresa foi SQL, o `config` acumulou 22 chaves
 * distintas, 5 delas sem nenhum leitor — a bagunca nao foi descuido de ninguem,
 * foi a ausencia de um caminho suportado.
 *
 * As mesmas duas recusas do cadastro valem aqui:
 *
 * - **`config` cru nao entra.** O backend monta o config a partir dos campos
 *   nomeados abaixo, preservando o que o sistema escreve (`lastClientSyncAt` e
 *   companhia) e descartando o que o contrato nao reconhece.
 * - **`account_chatwoot` e `erp` nao mudam.** Os dois sao identidade: a account
 *   amarra a empresa ao Chatwoot e e chave de unicidade; trocar o ERP mudaria o
 *   significado de toda credencial e de todo dado ja sincronizado. Para isso,
 *   cadastro novo.
 *
 * Com `forbidNonWhitelisted: true` no ValidationPipe global, qualquer campo nao
 * declarado aqui devolve 400 — inclusive uma tentativa de mandar `config`.
 */
export class UpdateCompanyDto {
  @ApiPropertyOptional({
    description: 'Nome da empresa, como aparece no sistema.',
    example: 'PROVEDOR EXEMPLO',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({
    description:
      'Endereco do ERP: apenas o host, sem "https://", sem barra final e sem caminho. Alterar este campo dispara um novo preflight.',
    example: 'erp.exemplo.com.br',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  url?: string;

  @ApiPropertyOptional({
    description: [
      'Credenciais de acesso ao ERP. Envie apenas quando forem trocar — omitir mantem as atuais.',
      '',
      'Os campos dependem do ERP ja cadastrado (GET /companies/erps lista sempre atualizado):',
      '',
      '- IXC: autorization',
      '- SGP: username, password',
      '- MK: sys, password, cd_servico, masterToken',
      '- HUBSOFT: client_id, username, password (client_secret e opcional)',
      '',
      'Alterar este campo dispara um novo preflight: se o ERP aceitar, a empresa e reativada; se recusar, fica inativa com o motivo registrado.',
    ].join('\n'),
    type: 'object',
    additionalProperties: true,
    example: { autorization: '00:0000000000000000000000000000000000000000' },
  })
  @IsOptional()
  @IsObject()
  credenciais?: Record<string, string>;

  @ApiPropertyOptional({
    description: [
      'Produto contratado. Aceita EXATAMENTE um destes dois valores:',
      '',
      '  "disparo"  -> disparo manual, campanhas, templates, historico',
      '  "cobranca" -> tudo acima + dashboard, clientes vencidos, chat',
      '',
      'Definir o plano remove as flags de pagina do modelo antigo (page_*), que teriam precedencia e fariam a troca parecer sem efeito.',
    ].join('\n'),
    enum: PLANOS,
    example: 'cobranca',
  })
  @IsOptional()
  @IsIn(PLANOS as unknown as string[])
  plano?: string;

  @ApiPropertyOptional({
    description: [
      'Paginas liberadas ALEM do plano. Substitui a lista atual por completo.',
      'Envie array vazio para remover todos os adicionais.',
      '',
      'Aceita apenas os nomes abaixo, escritos exatamente assim:',
      '',
      `  ${PAGINAS_IDS.join('\n  ')}`,
    ].join('\n'),
    enum: PAGINAS_IDS,
    isArray: true,
    example: ['clientesVencidos'],
  })
  @IsOptional()
  @IsArray()
  @IsIn(PAGINAS_IDS as unknown as string[], { each: true })
  paginasExtras?: string[];

  @ApiPropertyOptional({
    description:
      'Ajustes de comunicacao com o ERP. Envie apenas os que quiser mudar.',
    type: AjustesErpDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AjustesErpDto)
  ajustes?: AjustesErpDto;

  @ApiPropertyOptional({
    description: 'CNPJ da empresa, apenas digitos.',
    example: '00000000000000',
  })
  @IsOptional()
  @IsString()
  cnpj?: string;

  @ApiPropertyOptional({
    description: 'Id do time de cobranca no Chatwoot. Envie "" para limpar.',
    example: '00',
  })
  @IsOptional()
  @IsString()
  teamChargeId?: string;

  @ApiPropertyOptional({
    description: 'Token da empresa usado no webhook de agentes do Maestro.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  token_system_coraxy?: string;

  @ApiPropertyOptional({
    description: 'X-Api-Token da conta NotificaMe.',
  })
  @IsOptional()
  @IsString()
  token_notificameHub?: string;

  @ApiPropertyOptional({
    description:
      'Canais NotificaMe da empresa. Substitui a lista atual por completo.',
    type: [CanalNotificameDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CanalNotificameDto)
  canais?: CanalNotificameDto[];
}
