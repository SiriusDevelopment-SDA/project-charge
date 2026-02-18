import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppServiceServices } from './app.service.services';
import { ApiTags } from '@nestjs/swagger';
import { SearchServicesDTO } from './dto/SearchServiceDto';

@ApiTags('Serviços')
@Controller('services')
export class ControllerServices {
    constructor (private readonly appService: AppServiceServices) {}

    @Post()
    getServices(@Body() dto: SearchServicesDTO){
        return this.appService.getServices(dto.companyId, dto);
    }
}
