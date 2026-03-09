import {
  Body,
  Controller,
  Post,
} from '@nestjs/common';
import { SearchRequestDtoClients } from './dto/search.request.dto.clients';
import { AppServiceClient } from './app.service.clients';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Clients')
@Controller('clients')
export class ControllerClients {
  constructor(private readonly appService: AppServiceClient) {}

  @Post('search')
  @ApiOperation({ summary: 'Busca clientes por account e filtros' })
  @ApiBody({ type: SearchRequestDtoClients })
  getClients(@Body() searchDto: SearchRequestDtoClients) {
    return this.appService.getClients(searchDto);
  }
}
