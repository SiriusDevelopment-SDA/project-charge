import {
  Body,
  Controller,
  Post,
} from '@nestjs/common';
import { AppServiceTemplate } from './app.service.templates';
import {
  DispatchBatchStatusDto,
  LatestDispatchBatchReportDto,
  SearchRequestDtoRelatories,
  SearchRequestDtoTemplates,
  SendTemplateDto,
} from './dto/search.request.dto.templates';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DeleteTemplateDto } from './dto/delete.request.dto.templates';
import { CreateTemplateDTO } from './dto/create.request.dto.template';

@ApiTags('Templates')
@Controller('templates')
export class ControllerTemplates {
  constructor(private readonly appService: AppServiceTemplate) { }

  @Post('search')
  @ApiOperation({ summary: 'Lista templates por account e filtros' })
  @ApiBody({ type: SearchRequestDtoTemplates })
  getTemplates(@Body() searchDto: SearchRequestDtoTemplates) {
    return this.appService.getTemplates(searchDto);
  }

  @Post('send')
  @ApiOperation({ summary: 'Dispara um template para os destinatários informados' })
  @ApiBody({ type: SendTemplateDto })
  sendTemplate(@Body() sendTemplateDto: SendTemplateDto) {
    return this.appService.sendTemplate(sendTemplateDto);
  }

  @Post('batches/latest-report')
  @ApiOperation({ summary: 'Consulta o relatório do último lote de disparo' })
  @ApiBody({ type: LatestDispatchBatchReportDto })
  getLatestDispatchBatchReport(@Body() dto: LatestDispatchBatchReportDto) {
    return this.appService.getLatestDispatchBatchReport(dto);
  }

  @Post('batches/status')
  @ApiOperation({ summary: 'Consulta o status de um lote de disparo' })
  @ApiBody({ type: DispatchBatchStatusDto })
  getDispatchBatchStatus(@Body() dto: DispatchBatchStatusDto) {
    return this.appService.getDispatchBatchStatus(dto);
  }

  @Post('reports/search')
  @ApiOperation({ summary: 'Lista relatórios de disparo de template' })
  @ApiBody({ type: SearchRequestDtoRelatories })
  getRelatoriesDispatchTemplates(@Body() searchDto: SearchRequestDtoRelatories) {
    return this.appService.getRelatoriesDispatchTemplate(searchDto);
  }

  @Post('delete')
  @ApiOperation({ summary: 'Desativa template por ID' })
  @ApiBody({ type: DeleteTemplateDto })
  disableTemplate(@Body() deleteTemplateDto: DeleteTemplateDto) {
    return this.appService.disableTemplate(deleteTemplateDto.templateId);
  }

  @Post('create')
  @ApiOperation({ summary: 'Cria template e envia para integração NotificaMe' })
  @ApiBody({ type: CreateTemplateDTO })
  createTemplate(@Body() dto: CreateTemplateDTO) {
    return this.appService.createTemplate(dto.companyId, dto);
  }

}
