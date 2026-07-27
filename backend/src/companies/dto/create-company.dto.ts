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
  @ApiProperty({ description: 'Id do canal no NotificaMe Hub.' })
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty({ description: 'Numero do canal.', example: '+55 11 3619-3617' })
  @IsString()
  numero!: string;
}

/**
 * Cadastro de empresa.
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
  @ApiProperty({ description: 'Nome da empresa.', example: 'TOPLINK' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description:
      'Host do ERP, SEM protocolo e SEM caminho. O backend monta a URL completa.',
    example: 'ixc.toplinkbrasil.com.br',
  })
  @IsString()
  @IsNotEmpty()
  url!: string;

  @ApiProperty({
    description: 'account_chatwoot da empresa. Precisa ser unico.',
    example: '13',
  })
  @IsString()
  @IsNotEmpty()
  account_chatwoot!: string;

  @ApiProperty({
    description:
      'ERP integrado. Aceita apenas codigos do registro — consulte GET /integrations/erps para ver capacidades e ressalvas de cada um.',
    enum: erpCodes(),
  })
  @IsString()
  @IsIn(erpCodes(), {
    message: `erp deve ser um destes: ${erpCodes().join(', ')}`,
  })
  erp!: string;

  @ApiProperty({
    description:
      'Credenciais do ERP. Os campos exigidos variam por ERP e sao declarados no registro — GET /integrations/erps lista quais sao obrigatorios para cada um. Sao persistidas no local correto (coluna ou config) pelo backend.',
    example: { username: 'usuario', password: 'senha' },
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  credenciais!: Record<string, string>;

  @ApiProperty({
    description:
      'Plano contratado. Define quais paginas a empresa enxerga. "disparo" libera campanhas, templates, disparo manual e historico; "cobranca" libera tudo. Obrigatorio de proposito: e uma decisao comercial e defaulta-la em silencio significa entregar o produto de cobranca de graca.',
    enum: PLANOS,
  })
  @IsIn(PLANOS as unknown as string[])
  plano!: string;

  @ApiProperty({
    description:
      'token_system_coraxy da empresa. Usado na autorizacao do webhook de agentes do Maestro.',
  })
  @IsString()
  @IsNotEmpty()
  token_system_coraxy!: string;

  @ApiPropertyOptional({
    description:
      'Paginas liberadas alem do plano, para adicional vendido avulso (ex.: plano "disparo" com clientes vencidos).',
    enum: PAGINAS_IDS,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsIn(PAGINAS_IDS as unknown as string[], { each: true })
  paginasExtras?: string[];

  @ApiPropertyOptional({
    description:
      'Id da empresa no CRM. Serve para correlacionar os dois lados e torna o cadastro idempotente: reenviar o mesmo id devolve a empresa existente em vez de erro, entao o CRM pode repetir com seguranca depois de um timeout de rede.',
  })
  @IsOptional()
  @IsString()
  crm_company_id?: string;

  @ApiPropertyOptional({ description: 'CNPJ, apenas digitos.' })
  @IsOptional()
  @IsString()
  cnpj?: string;

  @ApiPropertyOptional({ description: 'Id do time de cobranca no Chatwoot.' })
  @IsOptional()
  @IsString()
  teamChargeId?: string;

  @ApiPropertyOptional({
    description: 'X-Api-Token da conta NotificaMe (compartilhado por canal).',
  })
  @IsOptional()
  @IsString()
  token_notificameHub?: string;

  @ApiPropertyOptional({
    description: 'Canais NotificaMe da empresa.',
    type: [CanalNotificameDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CanalNotificameDto)
  canais?: CanalNotificameDto[];
}
