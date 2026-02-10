import {
  Body,
  Controller,
  Delete,
  Post,
  Param,
  ParseUUIDPipe,
  Req,
  Request
} from '@nestjs/common';
import { AppServiceTemplate } from './app.service.templates';
import { SearchRequestDtoRelatories, SearchRequestDtoTemplates, SendTemplateDto } from './dto/search.request.dto.templates';
import { DeleteTemplateDto } from './dto/delete.request.dto.templates';
import { CreateTemplateDTO } from './dto/create.request.dto.template';
import { Company } from '../companies/entities/companies';

@Controller()
export class ControllerTemplates {
  constructor(private readonly appService: AppServiceTemplate) { }

  @Post('search/templates')
  getTemplates(@Body() searchDto: SearchRequestDtoTemplates) {
    return this.appService.getTemplates(searchDto);
  }

  @Post('send/template')
  sendTemplate(@Body() sendTemplateDto: SendTemplateDto) {
    return this.appService.sendTemplate(sendTemplateDto);
  }

  @Post('search/relatories')
  getRelatoriesDispatchTemplates(@Body() searchDto: SearchRequestDtoRelatories) {
    return this.appService.getRelatoriesDispatchTemplate(searchDto);
  }

  @Post('delete/template')
  disableTemplate(@Body() deleteTemplateDto: DeleteTemplateDto) {
    return this.appService.disableTemplate(deleteTemplateDto.templateId);
  }

  @Post('create/template')
  createTemplate(@Body() dto: CreateTemplateDTO) {
    return this.appService.createTemplate(dto.companyId, dto);
  }

}