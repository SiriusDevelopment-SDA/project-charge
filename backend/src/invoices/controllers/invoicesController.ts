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
            reason: 'Cliente nÃ£o encontrado',
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
      throw new NotFoundException('Nenhum cliente encontrado para a empresa informada.');
    }

    if (clients[0]?.company?.erp !== 'IXC') {
      throw new BadRequestException(
        'Consulta por rÃ©gua de cobranÃ§a disponÃ­vel apenas para empresas IXC.',
      );
    }

    const localClientsByClientId = new Map<string, Client[]>();
    clients.forEach((client) => {
      const clientId = String(client.clientId ?? '').trim();
      if (!clientId) {
        return;
      }

      const current = localClientsByClientId.get(clientId) ?? [];
      current.push(client);
      localClientsByClientId.set(clientId, current);
    });

    const invoicesByClientId = await this.ixcService.searchInvoicesByRule(
      companyId,
      filter,
    );
    const resultados: ResultInvoicesDto[] = [];
    const unmatchedClientIds: string[] = [];

    invoicesByClientId.forEach(({ clientId, invoices }) => {
      const matchingClients = localClientsByClientId.get(clientId) ?? [];

      if (!matchingClients.length) {
        unmatchedClientIds.push(clientId);
        return;
      }

      matchingClients.forEach((cliente) => {
        const normalizedDocument = String(cliente.cnpj_cpf ?? '').replace(/\D/g, '');
        resultados.push(this.mapResult(cliente, normalizedDocument, invoices));
      });
    });

    if (unmatchedClientIds.length) {
      console.warn(
        '[InvoicesController.searchInvoicesByCompanyRule] clientes do IXC sem correspondencia local',
        {
          companyId,
          total: unmatchedClientIds.length,
          clientIds: unmatchedClientIds.slice(0, 20),
        },
      );
    }

    const uniqueResults = [
      ...new Map(resultados.map((item) => [item.clientData.id, item])).values(),
    ];
    const emptyMessage =
      invoicesByClientId.length > 0 && uniqueResults.length === 0
        ? 'O IXC retornou faturas, mas nenhum id_cliente foi encontrado na base local.'
        : 'Nenhum cliente encontrado para os filtros informados.';

    return this.buildBatchResponse(
      uniqueResults,
      [],
      'Clientes encontrados pela rÃ©gua de cobranÃ§a.',
      emptyMessage,
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
            'Filtro de rÃ©gua de cobranÃ§a disponÃ­vel apenas para empresas IXC.',
          );
        }

        return this.hubsoftService.getInvoices(cliente);

      case 'SGP':
        if (filter) {
          throw new BadRequestException(
            'Filtro de rÃ©gua de cobranÃ§a disponÃ­vel apenas para empresas IXC.',
          );
        }

        return this.sgpService.getInvoices(cliente);

      default:
        throw new BadRequestException(`ERP nÃ£o suportado: ${cliente.company.erp}`);
    }
  }

  private mapResult(
    cliente: Client,
    normalizedDocument: string,
    invoices: InvoicesResponseDto,
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
      message = 'Nenhum cliente pÃ´de ser processado.';
    }

    return {
      status,
      message,
      data: resultados,
      errors: errors.length ? errors : undefined,
    };
  }
}
