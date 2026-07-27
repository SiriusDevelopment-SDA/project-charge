import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { erpCodes } from '../../integrations/erp/erp.registry';
import { PAGINAS_IDS, PLANOS } from '../planos';

export class CanalNotificameDto {
  @ApiProperty({
    description: 'Id do canal no NotificaMe Hub.',
    example: '00000000-0000-0000-0000-000000000000',
  })
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty({
    description: 'Numero do canal, com DDI e DDD.',
    example: '+55 00 0000-0000',
  })
  @IsString()
  numero!: string;
}

/**
 * Cadastro de empresa.
 *
 * ATENCAO AO EDITAR: os `example` deste arquivo aparecem na documentacao
 * Swagger, que hoje esta publicamente acessivel em `/api/docs`. Use somente
 * valores ficticios — nunca host, CNPJ, telefone ou token de cliente real.
 *
 * O que este DTO deliberadamente NAO aceita:
 *
 * - **`config` cru.** Era o vetor do incidente que originou este endpoint: o
 *   `config` vinha copiado inteiro de outra empresa, trazendo junto o marcador
 *   `lastClientSyncAt` (que fazia a empresa nascer travada em sincronizacao
 *   incremental e nunca baixar faturas) e ate as credenciais da empresa de
 *   origem. Aqui o `config` e MONTADO pelo backend a partir de campos nomeados.
 *
 * - **As colunas mortas** (`table_vector`, `label`, `total_active_customers`,
 *   `downtime`, `responsible`, `acess_token_agentbot_chatwoot`). Nenhuma tem
 *   leitura em backend ou frontend; sao `NOT NULL` por historico. O backend
 *   preenche com valor minimo e nunca pergunta ao operador.
 *
 * Como `forbidNonWhitelisted: true` esta ativo no ValidationPipe global
 * (`main.ts`), qualquer campo nao declarado aqui resulta em 400 — inclusive uma
 * tentativa de mandar `config`.
 */
export class CreateCompanyDto {
  @ApiProperty({
    description: 'Nome da empresa, como deve aparecer no sistema.',
    example: 'PROVEDOR EXEMPLO',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description:
      'Endereco do ERP: apenas o host. Sem "https://", sem barra no final e sem caminho — o backend monta a URL completa.',
    example: 'erp.exemplo.com.br',
  })
  @IsString()
  @IsNotEmpty()
  url!: string;

  @ApiProperty({
    description:
      'Numero da conta da empresa no Chatwoot. Precisa ser unico: repetido devolve 409.',
    example: '99',
  })
  @IsString()
  @IsNotEmpty()
  account_chatwoot!: string;

  @ApiProperty({
    description:
      'ERP da empresa. Consulte GET /companies/erps para ver, de cada ERP, o que o sistema sincroniza e quais credenciais exige.',
    enum: erpCodes(),
    example: 'IXC',
  })
  @IsString()
  @IsIn(erpCodes(), {
    message: `erp deve ser um destes: ${erpCodes().join(', ')}`,
  })
  erp!: string;

  @ApiProperty({
    description: [
      'Credenciais de acesso ao ERP. Os campos mudam conforme o `erp` escolhido:',
      '',
      '- IXC: autorization',
      '- SGP: username, password',
      '- MK: sys, password, cd_servico, masterToken',
      '- HUBSOFT: client_id, username, password (client_secret e opcional)',
      '- RADIUSNET: nenhuma',
      '',
      'A credencial e testada no ERP antes de a empresa ser gravada. Campo faltando devolve 400 dizendo qual e e para que serve. GET /companies/erps traz a lista sempre atualizada.',
    ].join('\n'),
    example: { autorization: '00:0000000000000000000000000000000000000000' },
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  credenciais!: Record<string, string>;

  @ApiProperty({
    description: [
      'Produto contratado pela empresa. Aceita EXATAMENTE um destes dois valores:',
      '',
      '  "disparo"  -> libera: disparo manual, campanhas, templates, historico',
      '  "cobranca" -> libera tudo acima + dashboard, clientes vencidos, chat',
      '',
      'Obrigatorio de proposito: e uma decisao comercial, e assumir um valor padrao em silencio significaria entregar o produto de cobranca sem ter sido vendido.',
    ].join('\n'),
    enum: PLANOS,
    example: 'cobranca',
  })
  @IsIn(PLANOS as unknown as string[])
  plano!: string;

  @ApiProperty({
    description:
      'Token da empresa, usado na autorizacao do webhook de agentes do Maestro.',
    example: 'token-da-empresa-aqui',
  })
  @IsString()
  @IsNotEmpty()
  token_system_coraxy!: string;

  @ApiPropertyOptional({
    description: [
      'Paginas liberadas ALEM do plano, para quando um item e vendido avulso.',
      'Ex.: plano "disparo" com clientes vencidos incluso.',
      '',
      'Aceita apenas os nomes abaixo, escritos exatamente assim:',
      '',
      `  ${PAGINAS_IDS.join('\n  ')}`,
      '',
      'Nome fora dessa lista devolve 400. Omita o campo se nao houver adicional.',
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
      'Id da empresa no CRM. Envie sempre: e o que permite repetir a chamada com seguranca depois de um timeout de rede — o reenvio devolve a empresa ja existente em vez de erro.',
    example: 'CRM-0001',
  })
  @IsOptional()
  @IsString()
  crm_company_id?: string;

  @ApiPropertyOptional({
    description: 'CNPJ da empresa, apenas digitos.',
    example: '00000000000000',
  })
  @IsOptional()
  @IsString()
  cnpj?: string;

  @ApiPropertyOptional({
    description: 'Id do time de cobranca no Chatwoot.',
    example: '00',
  })
  @IsOptional()
  @IsString()
  teamChargeId?: string;

  @ApiPropertyOptional({
    description:
      'X-Api-Token da conta NotificaMe. E compartilhado entre os canais da empresa.',
  })
  @IsOptional()
  @IsString()
  token_notificameHub?: string;

  @ApiPropertyOptional({
    description: 'Canais NotificaMe pelos quais a empresa dispara.',
    type: [CanalNotificameDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CanalNotificameDto)
  canais?: CanalNotificameDto[];
}
