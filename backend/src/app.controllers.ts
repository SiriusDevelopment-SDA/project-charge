import { AppService } from './app.services';
import {
  Body,
  Controller,
  Get,
  Post,
} from '@nestjs/common';
import { GetClientsDto } from './dto/clientsDto';

@Controller()
export class AppCobrancaController {
  constructor(private readonly appService: AppService) {}

  @Post('buscar/clientes')
  getClients(@Body() client: GetClientsDto) {
    console.log('payload validado:', client);
    return this.appService.getClients(client);
  }
}