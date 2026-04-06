import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ClientInteractionService } from './client-interaction.service';
import { CreateClientInteractionDto } from './dto/create-client-interaction.dto';

@ApiTags('Client Interaction')
@Controller('client-interaction')
export class ClientInteractionController {
  constructor(private readonly service: ClientInteractionService) {}

  @Get('client/:clientId')
  @ApiOperation({ summary: 'List all interactions for a client' })
  findByClient(@Param('clientId') clientId: string) {
    return this.service.findByClient(clientId);
  }

  @Post()
  @ApiOperation({ summary: 'Register a new client interaction' })
  create(@Body() dto: CreateClientInteractionDto) {
    return this.service.create(dto);
  }

  @Get('dispatches/summary')
  @ApiOperation({ summary: 'Get dispatch count and last dispatch date for a client phone' })
  @ApiQuery({ name: 'phone', required: true })
  @ApiQuery({ name: 'company_id', required: true })
  getDispatchSummary(
    @Query('phone') phone: string,
    @Query('company_id') company_id: string,
  ) {
    return this.service.getDispatchSummaryByPhone(phone, company_id);
  }

  @Post('dispatches/summary-batch')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get dispatch summary for multiple phones in a single company' })
  getDispatchSummaryBatch(
    @Body('phones') phones: string[],
    @Body('company_id') company_id: string,
  ) {
    return this.service.getDispatchSummaryBatch(phones ?? [], company_id);
  }
}
