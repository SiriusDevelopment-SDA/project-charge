import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Activity } from '../activity-log/activity.decorator';

import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/create-campanhas.dto';
import { CollectionsMetricsResponseDto, MarkCollectionResponseDto } from './dto/collections.dto';

@ApiTags('Campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post('create')
  @Activity({ category: 'create', action: 'Criou uma campanha', entity: 'campaign' })
  @ApiOperation({ summary: 'Cria uma nova campanha' })
  @ApiBody({ type: CreateCampaignDto })
  create(@Body() createDto: CreateCampaignDto) {
    return this.campaignsService.create(createDto);
  }

  @Post('by-clients')
  @ApiOperation({ summary: 'Retorna campanhas vinculadas a uma lista de IDs de clientes' })
  @ApiBody({ schema: { type: 'object', properties: { clientIds: { type: 'array', items: { type: 'string' } } } } })
  getByClientIds(@Body('clientIds') clientIds: string[]) {
    return this.campaignsService.findByClientIds(clientIds ?? []);
  }

  @Get()
  @ApiOperation({ summary: 'Lista campanhas por account' })
  @ApiQuery({ name: 'account', required: true, type: String })
  findAll(@Query('account') account: string) {
    return this.campaignsService.findByAccount(account);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Retorna métricas de campanhas por account' })
  @ApiQuery({ name: 'account', required: true, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  getMetrics(
    @Query('account') account: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
  ) {
    return this.campaignsService.getMetricsByAccount(account, {
      search,
      category,
    });
  }

  @Get('collections/metrics')
  @ApiOperation({ summary: 'Returns collections response metrics by account' })
  @ApiQuery({ name: 'account', required: true, type: String })
  getCollectionsMetrics(@Query('account') account: string): Promise<CollectionsMetricsResponseDto> {
    return this.campaignsService.getCollectionsMetricsByAccount(account);
  }

  @Post('collections/responded')
  @ApiOperation({ summary: 'Marks a customer as responded after collection dispatch' })
  @ApiBody({ type: MarkCollectionResponseDto })
  markCollectionsResponded(@Body() dto: MarkCollectionResponseDto) {
    return this.campaignsService.markCustomerRespondedAfterCharge(
      dto.account,
      dto.number,
      dto.respondedAt,
    );
  }

  @Patch(':id/toggle-status')
  @ApiOperation({ summary: 'Alterna status da campanha (ativa/inativa)' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  toggleStatus(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.campaignsService.toggleStatus(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza dados da campanha' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateCampaignDto })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() updateDto: UpdateCampaignDto,
  ) {
    return this.campaignsService.update(id, updateDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca campanha por ID' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.campaignsService.findOne(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove campanha por ID' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.campaignsService.remove(id);
  }
}
