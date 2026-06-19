import { Controller, Post, Param} from "@nestjs/common";
import { ApiTags, ApiOkResponse, ApiOperation, ApiParam } from '@nestjs/swagger';
import { AppServiceGraphics } from "./app.service.graphics";
import { ChargesDto } from "./dto/chargesDto";
import { TemplateMetricsDto } from "./dto/templateMetricsDto";

@ApiTags('gráficos')
@Controller('graphics')
export class GraphicsController{
    constructor(private readonly graphicsService: AppServiceGraphics){}

    @Post('charges/:companyId')
    @ApiOkResponse({ type: [ChargesDto] })
    async getCharges(@Param('companyId') companyId: string){
        return await this.graphicsService.getCharges(companyId);
    }

    @Post('dispatches/:companyId')
    async getMonthlyDispatches(@Param('companyId') companyId: string){
        return await this.graphicsService.getMonthlyDispatches(companyId);
    }

    @Post('return-rate/:companyId')
    async getMonthlyReturnRate(@Param('companyId') companyId: string){
        return await this.graphicsService.getMonthlyReturnRate(companyId);
    }

    @Post('campaigns/:account')
    async getCampaignsStats(@Param('account') account: string){
        return await this.graphicsService.getCampaignsStats(account);
    }

    @Post('promises/:companyId')
    async getPaymentPromisesStats(@Param('companyId') companyId: string){
        return await this.graphicsService.getPaymentPromisesStats(companyId);
    }

    @Post('aging/:companyId')
    async getDelinquencyAging(@Param('companyId') companyId: string){
        return await this.graphicsService.getDelinquencyAging(companyId);
    }

    @Post('forecast/:companyId')
    async getPaymentForecast(@Param('companyId') companyId: string){
        return await this.graphicsService.getPaymentForecast(companyId);
    }

    @Post('debt-conversion/:companyId')
    async getDebtConversion(@Param('companyId') companyId: string){
        return await this.graphicsService.getDebtConversion(companyId);
    }

    @Post('payment-profile/:companyId')
    async getPaymentProfile(@Param('companyId') companyId: string){
        return await this.graphicsService.getPaymentProfile(companyId);
    }

    @Post('templates/:templateId')
    @ApiOperation({
        summary: 'Métricas agregadas de um template',
        description:
            'Efetividade (disparados/entregues/falhos/respondidos) e recuperação financeira ' +
            '(valor cobrado x recuperado) de um único template. O templateId é UUID único por ' +
            'empresa, logo a consulta já é segura multi-tenant. Template inexistente retorna ' +
            'campos zerados com templateName vazio.',
    })
    @ApiParam({ name: 'templateId', description: 'UUID do template' })
    @ApiOkResponse({ type: TemplateMetricsDto })
    async getTemplateMetrics(@Param('templateId') templateId: string){
        return await this.graphicsService.getTemplateMetrics(templateId);
    }
}