import { Body, Controller, Post } from '@nestjs/common';
import { AppServiceServices } from './app.service.services';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SearchServicesDTO } from './dto/SearchServiceDto';

@ApiTags('Services')
@Controller('services')
export class ControllerServices {
    constructor (private readonly appService: AppServiceServices) {}

    @Post()
    @ApiOperation({ summary: 'Lista serviços da empresa' })
    @ApiBody({ type: SearchServicesDTO })
    getServices(@Body() dto: SearchServicesDTO){
        return this.appService.getServices(dto.companyId, dto);
    }
}
