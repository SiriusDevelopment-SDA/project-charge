import {
  Body,
  Controller,
  Post,
} from '@nestjs/common';
import { AppServiceTemplate } from './app.service.templates';
import { SearchRequestDtoRelatories, SearchRequestDtoTemplates, SendTemplateDto } from './dto/search.request.dto.templates';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Templates')
@Controller('template')
export class ControllerTemplates {
  constructor(private readonly appService: AppServiceTemplate) {}

  @Post('search')
  getTemplates(@Body() searchDto: SearchRequestDtoTemplates) {
    return this.appService.getTemplates(searchDto);
  }

  @Post('send')
  sendTemplate(@Body() sendTemplateDto: SendTemplateDto) {
    return this.appService.sendTemplate(sendTemplateDto);
  }

  @Post('relatories/search')
  getRelatoriesDispatchTemplates(@Body() searchDto: SearchRequestDtoRelatories) {
    return this.appService.getRelatoriesDispatchTemplate(searchDto);
  }
}