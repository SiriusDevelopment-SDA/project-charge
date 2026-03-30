import {
  Body,
  Controller,
  Post,
} from '@nestjs/common';
import { SearchRequestDtoClients } from './dto/search.request.dto.clients';
import { AppServiceClient } from './app.service.clients';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClientsSyncCron } from './clients-sync.cron';

@ApiTags('Clients')
@Controller('clients')
export class ControllerClients {
  constructor(
    private readonly appService: AppServiceClient,
    private readonly clientsSyncCron: ClientsSyncCron,
  ) {}

  @Post('search')
  @ApiOperation({ summary: 'Busca clientes por account e filtros' })
  @ApiBody({ type: SearchRequestDtoClients })
  getClients(@Body() searchDto: SearchRequestDtoClients) {
    return this.appService.getClients(searchDto);
  }

  @Post('sync')
  @ApiOperation({ summary: 'Dispara sincronização manual de clientes do ERP' })
  async syncClients() {
    await this.clientsSyncCron.syncClientsFromERP();
    return { message: 'Sincronização concluída. Verifique os logs para detalhes.' };
  }
}
