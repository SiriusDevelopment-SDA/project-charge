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
}