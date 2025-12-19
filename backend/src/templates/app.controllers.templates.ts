import {
  Body,
  Controller,
  Post,
} from '@nestjs/common';
import { AppServiceTemplate } from './app.service.templates';
import { SearchRequestDtoTemplates } from './dto/search.request.dto.templates';

@Controller()
export class ControllerTemplates {
  constructor(private readonly appService: AppServiceTemplate) {}

  @Post('buscar/templates')
  getTemplates(@Body() searchDto: SearchRequestDtoTemplates) {
    return this.appService.getTemplates(searchDto);
  }
}