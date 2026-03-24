import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Raw, Repository } from 'typeorm';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Client } from '../../clients/entities.ts/clients';
import { IXCInvoicesService } from '../services/ixcInvoicesService';
import { HubsoftInvoicesService } from '../services/hubsoftInvoicesService';
import { SGPInvoicesService } from '../services/sgpInvoicesService';
import {
  InvoiceBatchPartialDto,
  InvoiceBatchResponseDto,
  InvoiceSearchFilterDto,
  InvoicesResponseDto,
  ResultInvoicesDto,
  SearchRequestInvoicesDto,
} from '../dto/search.request.dto.invoices';
import {
  filterInvoicesByDueDates,
  getInvoiceRuleDueDatesMap,
  getInvoiceRuleReferenceDates,
} from '../utils/invoice-rule';

@ApiTags('Invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    private readonly ixcService: IXCInvoicesService,
    private readonly hubsoftService: HubsoftInvoicesService,
    private readonly sgpService: SGPInvoicesService,
  ) {}

  @Post('search')
  @HttpCode(200)
  @ApiOperation({ summary: 'Busca faturas por lista de documentos' })
  @ApiBody({ type: SearchRequestInvoicesDto })
  @ApiOkResponse({ type: InvoiceBatchPartialDto })
  async getInvoices(@Body() data: SearchRequestInvoicesDto) {
    const documents = (data.documents ?? []).map((item) => item.cnpj_cpf);

    if (!documents.length && !data.companyId) {
      throw new NotFoundException('Nenhum cliente encontrado');
    }

    if (!documents.length && data.companyId && data.filter) {
      return this.searchInvoicesByCompanyRule(data.companyId, data.filter);
    }

    const resultados: ResultInvoicesDto[] = [];
    const errors: { document: string; reason: string }[] = [];

    for (const doc of documents) {
      try {
        const normalizedQuery = doc.replace(/\D/g, '');

        const cliente = await this.clientRepo.findOne({
          where: {
            cnpj_cpf: Raw(
              (alias) => `regexp_replace(${alias}, '\\D', '', 'g') ILIKE :doc`,
              { doc: `%${normalizedQuery}%` },
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

        const invoices = await this.fetchInvoicesByClient(cliente, data.filter);
        resultados.push(this.mapResult(cliente, normalizedQuery, invoices));
      } catch {
        errors.push({
          document: doc,
          reason: 'Erro inesperado ao processar o cliente',
        });
      }
    }

    return this.buildBatchResponse(resultados, errors);
  }

  @Post('overdue/:companyId')
  @HttpCode(200)
  async getInvoicesOverdue(@Param('companyId') companyId: string) {
    const data = await this.hubsoftService.getInvoicesOverdue(companyId);

    return {
      status: data.length ? 'success' : 'error',
      message: data.length
        ? 'Clientes inadimplentes encontrados com sucesso.'
        : 'Nenhum cliente inadimplente encontrado.',
      data,
    };
  }

  private async searchInvoicesByCompanyRule(
    companyId: string,
    filter: InvoiceSearchFilterDto,
  ): Promise<InvoiceBatchResponseDto> {
    const clients = await this.clientRepo.find({
      where: {
        company: {
          id: companyId,
        },
      },
      relations: ['company'],
    });

    if (!clients.length) {
      throw new NotFoundException(
        'Nenhum cliente encontrado para a empresa informada.',
      );
    }

    if (!['IXC', 'SGP'].includes(clients[0]?.company?.erp)) {
      throw new BadRequestException(
        'Filtro de régua de cobrança disponível apenas para empresas IXC e SGP.',
      );
    }

    const dispatchDates = getInvoiceRuleReferenceDates(filter);
    if (!dispatchDates.length) {
      throw new BadRequestException(
        'A régua de cobrança precisa receber ao menos uma data de referência.',
      );
    }

    const dueDatesByDispatchDate = getInvoiceRuleDueDatesMap(filter);
    const resultados: ResultInvoicesDto[] = [];
    const errors: { document: string; reason: string }[] = [];

    for (const cliente of clients) {
      try {
        const normalizedDocument = String(cliente.cnpj_cpf ?? '').replace(/\D/g, '');
        const invoices = await this.fetchInvoicesByClient(cliente, filter);

        if (!Array.isArray(invoices.list) || invoices.list.length === 0) {
          continue;
        }

        dispatchDates.forEach((dispatchDate) => {
          const dueDates = dueDatesByDispatchDate.get(dispatchDate) ?? [];
          const filteredInvoices = filterInvoicesByDueDates(
            invoices.list,
            dueDates,
          );

          if (!filteredInvoices.length) {
            return;
          }

          resultados.push(
            this.mapResult(
              cliente,
              normalizedDocument,
              {
                ...invoices,
                list: filteredInvoices,
              },
              dispatchDate,
            ),
          );
        });
      } catch {
        errors.push({
          document: String(cliente.cnpj_cpf ?? ''),
          reason: 'Erro inesperado ao processar o cliente pela régua',
        });
      }
    }

    const uniqueResults = [
      ...new Map(
        resultados.map((item) => [
          `${item.dispatchDate ?? 'all'}:${item.clientData.id}`,
          item,
        ]),
      ).values(),
    ];

    return this.buildBatchResponse(
      uniqueResults,
      errors,
      'Clientes encontrados pela régua de cobrança.',
      'Nenhum cliente encontrado para os filtros informados.',
    );
  }

  private async fetchInvoicesByClient(
    cliente: Client,
    filter?: InvoiceSearchFilterDto,
  ): Promise<InvoicesResponseDto> {
    switch (cliente.company.erp) {
      case 'IXC':
        return this.ixcService.getInvoices(cliente, filter);

      case 'HUBSOFT':
        if (filter) {
          throw new BadRequestException(
            'Filtro de régua de cobrança indisponível para empresas HUBSOFT.',
          );
        }

        return this.hubsoftService.getInvoices(cliente);

      case 'SGP':
        return this.sgpService.getInvoices(cliente, filter);

      default:
        throw new BadRequestException(`ERP não suportado: ${cliente.company.erp}`);
    }
  }

  private mapResult(
    cliente: Client,
    normalizedDocument: string,
    invoices: InvoicesResponseDto,
    dispatchDate?: string,
  ): ResultInvoicesDto {
    return {
      clientData: {
        id: cliente.id,
        clientId: String(cliente.clientId ?? ''),
        cnpj_cpf: cliente.cnpj_cpf,
        name: cliente.name,
        whatsapp: cliente.whatsapp,
        email: cliente.email ?? null,
        company: {
          id: cliente.company.id,
          name: cliente.company.name,
          account: cliente.company.account_chatwoot,
        },
      },
      client: cliente.name,
      document: normalizedDocument,
      erp: cliente.company.erp,
      dispatchDate: dispatchDate ?? null,
      invoices,
    };
  }

  private buildBatchResponse(
    resultados: ResultInvoicesDto[],
    errors: { document: string; reason: string }[],
    successMessage = 'Todos os clientes foram processados com sucesso.',
    emptySuccessMessage?: string,
  ): InvoiceBatchResponseDto {
    const hasData = resultados.length > 0;
    const hasErrors = errors.length > 0;

    let status: InvoiceBatchResponseDto['status'];
    let message: string;

    if (hasData && hasErrors) {
      status = 'partial';
      message = 'Alguns clientes foram processados, outros apresentaram erro.';
    } else if (hasData) {
      status = 'success';
      message = successMessage;
    } else if (!hasErrors && emptySuccessMessage) {
      status = 'success';
      message = emptySuccessMessage;
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
}
