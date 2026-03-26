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
import { Company } from '../../companies/entities/companies';
import { IXCInvoicesService } from '../services/ixcInvoicesService';
import { HubsoftInvoicesService } from '../services/hubsoftInvoicesService';
import { SGPInvoicesService } from '../services/sgpInvoicesService';
import {
  InvoiceBatchPartialDto,
  InvoiceBatchResponseDto,
  InvoiceMapResultDto,
  InvoiceSearchFilterDto,
  InvoicesResponseDto,
  PixBatchRequestDto,
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
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
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
    console.log('[POST /invoices/search] body recebido:', JSON.stringify(data));
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

  @Post('pix/batch')
  @HttpCode(200)
  @ApiOperation({ summary: 'Busca codigos PIX por lista de invoice IDs (IXC)' })
  @ApiBody({ type: PixBatchRequestDto })
  async getPixBatch(@Body() data: PixBatchRequestDto) {
    const empresa = await this.companyRepo.findOne({
      where: { id: data.companyId },
    });

    if (!empresa) {
      throw new NotFoundException(`Empresa ${data.companyId} nao encontrada`);
    }

    const authorizationHeader = `Basic ${Buffer.from(empresa.autorization).toString('base64')}`;
    const ixcUrl = `https://${empresa.url}/webservice/v1/get_pix`;

    const results = await Promise.all(
      data.invoiceIds.map(async (invoiceId) => {
        try {
          const response = await fetch(ixcUrl, {
            method: 'POST',
            headers: {
              Authorization: authorizationHeader,
              'Content-Type': 'application/json',
              ixcsoft: 'listar',
            },
            body: JSON.stringify({ id_areceber: invoiceId }),
          });
          const boletoData = await response.json();
          const dadosPix = boletoData.pix?.dadosPix ?? {};
          const pixCode = (dadosPix.pixCopiaECola && dadosPix.status === 'ATIVA')
            ? dadosPix.pixCopiaECola
            : boletoData.pix?.qrCode?.qrcode ?? '';
          return { invoiceId, status: pixCode ? 'success' : 'error', pix: pixCode };
        } catch {
          return { invoiceId, status: 'error', pix: '' };
        }
      }),
    );

    return { results };
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

    console.log(`[searchInvoicesByCompanyRule] companyId: ${companyId}`);
    console.log(`[searchInvoicesByCompanyRule] filter recebido:`, JSON.stringify(filter));
    console.log(`[searchInvoicesByCompanyRule] total clientes encontrados: ${clients.length}`);

    if (!clients.length) {
      throw new NotFoundException(
        'Nenhum cliente encontrado para a empresa informada.',
      );
    }

    console.log(`[searchInvoicesByCompanyRule] ERP da empresa: ${clients[0]?.company?.erp}`);

    if (!['IXC', 'SGP'].includes(clients[0]?.company?.erp)) {
      throw new BadRequestException(
        'Filtro de régua de cobrança disponível apenas para empresas IXC e SGP.',
      );
    }

    const dispatchDates = getInvoiceRuleReferenceDates(filter);
    console.log(`[searchInvoicesByCompanyRule] dispatchDates calculadas:`, dispatchDates);

    if (!dispatchDates.length) {
      throw new BadRequestException(
        'A régua de cobrança precisa receber ao menos uma data de referência.',
      );
    }

    const dueDatesByDispatchDate = getInvoiceRuleDueDatesMap(filter);
    console.log(`[searchInvoicesByCompanyRule] dueDates por dispatchDate:`);
    dueDatesByDispatchDate.forEach((dates, key) => {
      console.log(`  ${key} → [${dates.slice(0, 3).join(', ')}... (${dates.length} datas)]`);
    });

    const resultados: ResultInvoicesDto[] = [];
    const errors: { document: string; reason: string }[] = [];
    const company = clients[0].company;

    if (company.erp === 'IXC') {
      const allDueDates = [...dueDatesByDispatchDate.values()].flat();
      const sortedDates = [...new Set(allDueDates)].sort((a, b) => a.localeCompare(b));
      const windowStart = sortedDates[0];
      const windowEnd = sortedDates[sortedDates.length - 1];

      const invoicesByClientId = await this.ixcService.getInvoicesByDateWindowBatch(
        company,
        windowStart,
        windowEnd,
      );

      const clientByIxcId = new Map(
        clients.map((c) => [String(c.clientId), c]),
      );

      invoicesByClientId.forEach((rawInvoices, ixcClientId) => {
        const cliente = clientByIxcId.get(ixcClientId);
        if (!cliente) return;

        const normalizedDocument = String(cliente.cnpj_cpf ?? '').replace(/\D/g, '');
        const invoiceList: InvoiceMapResultDto[] = rawInvoices.map((t) => {
          const contractId =
            t.id_contrato && t.id_contrato !== '' && t.id_contrato !== '0'
              ? t.id_contrato
              : t.id_contrato_principal && t.id_contrato_principal !== '' && t.id_contrato_principal !== '0'
              ? t.id_contrato_principal
              : t.id_contrato_avulso ?? null;

          return {
            invoice_id: String(t.id),
            contract_id: String(contractId),
            invoice_due_date: t.data_vencimento,
            invoice_amount: String(t.valor_aberto ?? t.valor),
            invoice_status: 'A Receber',
            ticket_digitable_line: null,
            ticket_pdf_link: null,
            code_pix: { status: 'error', pix: '' },
          } as InvoiceMapResultDto;
        });

        dispatchDates.forEach((dispatchDate) => {
          const dueDates = dueDatesByDispatchDate.get(dispatchDate) ?? [];
          const filteredInvoices = filterInvoicesByDueDates(invoiceList, dueDates);

          console.log(`[searchInvoicesByCompanyRule] ${cliente.name} | ${dispatchDate} | filtradas: ${filteredInvoices.length}`);

          if (!filteredInvoices.length) return;

          resultados.push(
            this.mapResult(
              cliente,
              normalizedDocument,
              { status: 'success', message: 'ok', list: filteredInvoices },
              dispatchDate,
            ),
          );
        });
      });
    } else if (company.erp === 'SGP') {
      const allDueDates = [...dueDatesByDispatchDate.values()].flat();
      const sortedDates = [...new Set(allDueDates)].sort((a, b) => a.localeCompare(b));
      const windowStart = sortedDates[0];
      const windowEnd = sortedDates[sortedDates.length - 1];

      const invoicesByCpf = await this.sgpService.getInvoicesByDateWindowBatch(
        company,
        windowStart,
        windowEnd,
      );

      const clientByCpf = new Map(
        clients.map((c) => [String(c.cnpj_cpf ?? '').replace(/\D/g, ''), c]),
      );

      invoicesByCpf.forEach((rawInvoices, cpf) => {
        const cliente = clientByCpf.get(cpf);
        if (!cliente) return;

        const invoiceList: InvoiceMapResultDto[] = rawInvoices.map((t) => ({
          invoice_id: String(t.id),
          contract_id: String(t.clienteContrato ?? ''),
          invoice_due_date: t.dataVencimento ?? '',
          invoice_amount: String(t.valorCorrigido ?? t.valor ?? ''),
          invoice_status: 'A Receber',
          ticket_digitable_line: t.linhaDigitavel || t.codigoBarras || null,
          ticket_pdf_link: t.link || null,
          code_pix: { status: t.codigoPix ? 'success' : 'error', pix: t.codigoPix ?? '' },
        } as InvoiceMapResultDto));

        dispatchDates.forEach((dispatchDate) => {
          const dueDates = dueDatesByDispatchDate.get(dispatchDate) ?? [];
          const filteredInvoices = filterInvoicesByDueDates(invoiceList, dueDates);

          console.log(`[searchInvoicesByCompanyRule] SGP ${cliente.name} | ${dispatchDate} | filtradas: ${filteredInvoices.length}`);

          if (!filteredInvoices.length) return;

          resultados.push(
            this.mapResult(
              cliente,
              cpf,
              { status: 'success', message: 'ok', list: filteredInvoices },
              dispatchDate,
            ),
          );
        });
      });
    } else {
      throw new BadRequestException('Filtro de régua de cobrança disponível apenas para empresas IXC e SGP.');
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
