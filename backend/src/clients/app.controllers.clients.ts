import {
  Body,
  Controller,
  Post,
} from '@nestjs/common';
import { SearchRequestDtoClients } from './dto/search.request.dto.clients';
import { AppServiceClient } from './app.service.clients';

@Controller()
export class ControllerClients {
  constructor(private readonly appService: AppServiceClient) {}

  @Post('search/clients')
  getClients(@Body() searchDto: SearchRequestDtoClients) {
    return this.appService.getClients(searchDto);
  }
}