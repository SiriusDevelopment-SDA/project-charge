import { Controller, Post, Param} from "@nestjs/common";
import { ApiTags, ApiOkResponse} from '@nestjs/swagger';
import { AppServiceGraphics } from "./app.service.graphics";
import { ChargesDto } from "./dto/chargesDto";

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

    @Post('campaigns/:companyId')
    async getCampaignsStats(@Param('companyId') companyId: string){
        return await this.graphicsService.getCampaignsStats(companyId);
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
}