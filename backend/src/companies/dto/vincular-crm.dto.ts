import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';

/**
 * Um par "empresa daqui" <-> "empresa no CRM".
 *
 * A empresa daqui e identificada por `account_chatwoot`, nao pelo id interno.
 * O motivo e pratico: o CRM ja conhece a account de cada empresa, e nao conhece
 * o uuid do nosso banco. Exigir o uuid transformaria o vinculo numa consulta
 * manual empresa por empresa — que e exatamente o trabalho que este endpoint
 * existe para evitar.
 */
export class VinculoCrmDto {
  @ApiProperty({
    description: 'Conta da empresa no Chatwoot, como ja cadastrada aqui.',
    example: '99',
  })
  @IsString()
  @IsNotEmpty()
  account_chatwoot!: string;

  @ApiProperty({
    description: 'Id da empresa correspondente no CRM.',
    example: 'CRM-0001',
  })
  @IsString()
  @IsNotEmpty()
  crm_company_id!: string;
}

/**
 * Vinculo em lote das empresas que existem dos dois lados mas nunca se
 * conheceram.
 *
 * ATENCAO AO EDITAR: os `example` aparecem no Swagger. Somente valores
 * ficticios — nunca account, host ou id real de cliente.
 *
 * POR QUE EM LOTE
 *
 * O `PATCH /webhooks/companies/:crm_company_id` identifica a empresa pelo
 * vinculo. Empresa sem vinculo e invisivel para o CRM: PATCH devolve 404 e o
 * POST devolve 409 porque o `account_chatwoot` ja existe. Toda empresa
 * cadastrada antes do endpoint de provisionamento esta nesse estado — nao uma
 * ou outra, praticamente todas. Vincular uma por vez seria uma sequencia de
 * chamadas identicas, e cada uma exigiria descobrir antes o uuid interno.
 *
 * O QUE ESTE ENDPOINT NAO FAZ
 *
 * Nao altera mais nada. Nao roda preflight, nao mexe em credencial, plano ou
 * pagina, e NAO limpa as chaves fora do contrato — mesmo sendo uma escrita no
 * `config`. Vincular nao e pedir faxina: quem chama aqui quer estabelecer uma
 * correspondencia, e uma limpeza junto seria efeito colateral nao pedido. A
 * limpeza continua acontecendo no primeiro PATCH de verdade que a empresa
 * receber, onde da para ver a lista do que saiu antes de aplicar.
 */
export class VincularCrmDto {
  @ApiProperty({
    description: [
      'Pares account_chatwoot -> crm_company_id.',
      '',
      'Cada item e decidido por conta propria e o resultado volta item a item:',
      'um par invalido nao impede os outros de serem vinculados. Reenviar o',
      'mesmo lote e seguro — par ja vinculado volta como `ja_vinculada`, sem',
      'escrita.',
    ].join('\n'),
    type: [VinculoCrmDto],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => VinculoCrmDto)
  vinculos!: VinculoCrmDto[];
}
