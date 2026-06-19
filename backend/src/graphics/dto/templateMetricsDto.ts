import { ApiProperty } from "@nestjs/swagger";

export class TemplateMetricsDto {
    @ApiProperty({ example: '8f2c1d3a-4b5e-6f70-8901-23456789abcd', description: 'UUID do template' })
    templateId!: string;

    @ApiProperty({ example: 'cobranca_vencida_v2', description: 'Nome do template (vazio se não encontrado)' })
    templateName!: string;

    @ApiProperty({ example: 1240, description: 'Total de disparos com esse template' })
    dispatched!: number;

    @ApiProperty({ example: 1180, description: "Disparos entregues (status_sent IN 'delivered','read')" })
    delivered!: number;

    @ApiProperty({ example: 35, description: "Disparos com falha (status_sent IN 'error','failed','undelivered')" })
    failed!: number;

    @ApiProperty({ example: 410, description: 'Disparos que tiveram resposta (response = true)' })
    responded!: number;

    @ApiProperty({ example: 33, description: 'Taxa de efetividade em % (responded/dispatched), inteiro' })
    responseRate!: number;

    @ApiProperty({ example: 75890.5, description: 'Valor total cobrado, extraído de components_maped' })
    amountCharged!: number;

    @ApiProperty({ example: 28430.9, description: 'Valor total recuperado (SUM de recovered_amount)' })
    amountRecovered!: number;

    @ApiProperty({ example: 37, description: 'Taxa de recuperação em % (amountRecovered/amountCharged), inteiro' })
    recoveryRate!: number;

    @ApiProperty({ example: '2026-01-04T12:30:00.000Z', nullable: true, description: 'Primeiro disparo (ISO) ou null' })
    firstDispatchAt!: string | null;

    @ApiProperty({ example: '2026-06-18T09:15:00.000Z', nullable: true, description: 'Último disparo (ISO) ou null' })
    lastDispatchAt!: string | null;
}
