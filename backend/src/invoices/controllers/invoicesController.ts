import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InvoicesService } from '../invoices.service';
import {
  InvoiceBatchPartialDto,
  PixBatchRequestDto,
  SearchRequestInvoicesDto,
} from '../dto/search.request.dto.invoices';

@ApiTags('Invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post('search')
  @HttpCode(200)
  @ApiOperation({ summary: 'Busca faturas por lista de documentos' })
  @ApiBody({ type: SearchRequestInvoicesDto })
  @ApiOkResponse({ type: InvoiceBatchPartialDto })
  getInvoices(@Body() data: SearchRequestInvoicesDto) {
    return this.invoicesService.getInvoicesBatch(data);
  }

  @Post('overdue-clients/search')
  @HttpCode(200)
  @ApiOperation({ summary: 'Lista clientes vencidos a partir do snapshot local de faturas' })
  searchOverdueClients(
    @Body()
    body: {
      account: string;
      query?: string;
      page?: number;
      limit?: number;
      agingMin?: number;
      agingMax?: number;
      debtMin?: number;
      debtMax?: number;
    },
  ) {
    return this.invoicesService.searchOverdueClients(body);
  }

  @Get('open-client-ids/:account')
  @HttpCode(200)
  @ApiOperation({ summary: 'Retorna clientIds com faturas em aberto (lê do cache Redis)' })
  getOpenClientIds(@Param('account') account: string) {
    return this.invoicesService.getOpenClientIds(account);
  }

  @Get('sync-state/:account')
  @HttpCode(200)
  @ApiOperation({ summary: 'Retorna o status da última sincronização de faturas por account' })
  getSyncState(@Param('account') account: string) {
    return this.invoicesService.getSyncState(account);
  }

  @Post('sync/company/:companyId')
  @HttpCode(202)
  @ApiOperation({ summary: 'Dispara sincronização manual de faturas da empresa no ERP' })
  syncCompanyInvoices(@Param('companyId') companyId: string) {
    return this.invoicesService.syncCompanyInvoices(companyId);
  }

  @Post('pix/batch')
  @HttpCode(200)
  @ApiOperation({ summary: 'Busca códigos PIX em lote pelo ERP ou snapshot local' })
  @ApiBody({ type: PixBatchRequestDto })
  getPixBatch(@Body() data: PixBatchRequestDto) {
    return this.invoicesService.getPixBatch(data);
  }
}
