import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsNumber } from "class-validator";

export class ChargesDto {
    @ApiProperty({
        example: 'Janeiro',
        description: 'Mês da cobrança',
    })
    @IsString()
    month!: string;

    @ApiProperty({
        example: 60000,
        description: 'Valor total de inadimplentes',
    })
    @IsNumber()
    default!: number;

    @ApiProperty({
        example: 320000,
        description: 'Valor total de faturas pagas'
    })
    payments!: number;
}