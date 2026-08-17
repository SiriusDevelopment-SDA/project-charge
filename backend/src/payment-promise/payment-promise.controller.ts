import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Activity } from '../activity-log/activity.decorator';
import { PaymentPromiseService } from './payment-promise.service';
import { CreatePaymentPromiseDto } from './dto/create-payment-promise.dto';

@ApiTags('Payment Promise')
@Controller('payment-promise')
export class PaymentPromiseController {
  constructor(private readonly service: PaymentPromiseService) {}

  @Get('client/:clientId')
  @ApiOperation({ summary: 'List all payment promises for a client' })
  findByClient(@Param('clientId') clientId: string) {
    return this.service.findByClient(clientId);
  }

  @Get('client/:clientId/latest')
  @ApiOperation({ summary: 'Get latest payment promise for a client' })
  findLatest(@Param('clientId') clientId: string) {
    return this.service.findLatestByClient(clientId);
  }

  @Get('company/:companyId')
  @ApiOperation({ summary: 'List all payment promises for a company' })
  findByCompany(@Param('companyId') companyId: string) {
    return this.service.findByCompany(companyId);
  }

  @Post('latest-batch')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get latest promise per client for a batch of client IDs' })
  latestBatch(@Body('clientIds') clientIds: string[]) {
    return this.service.findLatestBatch(clientIds ?? []);
  }

  @Post()
  @Activity({ category: 'create', action: 'Registrou uma promessa de pagamento', entity: 'payment-promise' })
  @ApiOperation({ summary: 'Create a new payment promise' })
  create(@Body() dto: CreatePaymentPromiseDto) {
    return this.service.create(dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update payment promise status' })
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: 'pending' | 'kept' | 'broken' | 'cancelled',
  ) {
    return this.service.updateStatus(id, status);
  }
}
