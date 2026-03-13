import { Controller, Post, Body, NotFoundException, BadRequestException, HttpCode, Param } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Client } from '../../clients/entities.ts/clients';
import { IXCInvoicesService } from '../services/ixcInvoicesService';
import { HubsoftInvoicesService } from '../services/hubsoftInvoicesService';
import { SGPInvoicesService } from '../services/sgpInvoicesService';
import { Raw, Repository } from 'typeorm';
import {
  InvoiceBatchPartialDto,
  InvoiceBatchResponseDto,
  InvoicesResponseDto,
  ResultInvoicesDto,
  SearchRequestInvoicesDto
} from '../dto/search.request.dto.invoices';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    private readonly ixcService: IXCInvoicesService,
    private readonly hubsoftService: HubsoftInvoicesService,
    private readonly sgpService: SGPInvoicesService,
  ) { }

  @Post('search')
  @HttpCode(200)
  @ApiOperation({ summary: 'Busca faturas por lista de documentos' })
  @ApiBody({ type: SearchRequestInvoicesDto })
  @ApiOkResponse({ type: InvoiceBatchPartialDto })
  async getInvoices(@Body() data: SearchRequestInvoicesDto) {
    if (!data.documents.length) throw new NotFoundException('Nenhum cliente encontrado');
    const documents = data.documents.map(i => i.cnpj_cpf)
    const resultados: ResultInvoicesDto[] = [];
    const errors: { document: string; reason: string }[] = [];

    for (const doc of documents) {
      try {
        const normalizedQuery = doc.replace(/\D/g, '');

        const cliente = await this.clientRepo.findOne({
          where: {
            cnpj_cpf: Raw(
              alias =>
                `regexp_replace(${alias}, '\\D', '', 'g') ILIKE :doc`,
              { doc: `%${normalizedQuery}%` }
            ),
          },
          relations: ['company'],
        });
        if (!cliente) {
          errors.push({
            document: doc,
            reason: 'Cliente não encontrado',
          });
          continue;
        }

        let invoices: InvoicesResponseDto;

        switch (cliente.company.erp) {
          case 'IXC':
            invoices = await this.ixcService.getInvoices(cliente);
            break;

          case 'HUBSOFT':

            invoices = await this.hubsoftService.getInvoices(cliente);
            break;

          case 'SGP':
            invoices = await this.sgpService.getInvoices(cliente);
            break;

          default:
            errors.push({
              document: doc,
              reason: `ERP não suportado: ${cliente.company.erp}`,
            });
            continue;
        }

        resultados.push({
          client: cliente.name,
          document: normalizedQuery,
          erp: cliente.company.erp,
          invoices,
        });
      } catch {
        errors.push({
          document: doc,
          reason: 'Erro inesperado ao processar o cliente',
        });
      }
    }
    let status: InvoiceBatchResponseDto['status'];
    let message: string;

    const hasData = resultados.length > 0;
    const hasErrors = errors.length > 0;

    if (hasData && hasErrors) {
      status = 'partial';
      message = 'Alguns clientes foram processados, outros apresentaram erro.';
    } else if (hasData) {
      status = 'success';
      message = 'Todos os clientes foram processados com sucesso.';
    } else {
      status = 'error';
      message = 'Nenhum cliente pôde ser processado.';
    }

    return {
      status,
      message,
      data: resultados,
      errors: errors.length ? errors : undefined,
    };
  }

  @Post('overdue/:companyId')
  @HttpCode(200)
  async getInvoicesOverdue(
    @Param('companyId') companyId: string
  ) {

    const data = await this.hubsoftService.getInvoicesOverdue(companyId);

    return {
      status: data.length ? 'success' : 'error',
      message: data.length
        ? 'Clientes inadimplentes encontrados com sucesso.'
        : 'Nenhum cliente inadimplente encontrado.',
      data
    };
  }
}
