import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Raw, Repository } from 'typeorm';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Client } from '../../clients/entities.ts/clients';
import { Company } from '../../companies/entities/companies';
import { IXCInvoicesService } from '../services/ixcInvoicesService';
import { HubsoftInvoicesService } from '../services/hubsoftInvoicesService';
import { SGPInvoicesService } from '../services/sgpInvoicesService';
import { InvoiceSyncCron } from '../invoice-sync.cron';
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
  private readonly logger = new Logger(InvoicesController.name);

  constructor(
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly ixcService: IXCInvoicesService,
    private readonly hubsoftService: HubsoftInvoicesService,
    private readonly sgpService: SGPInvoicesService,
    private readonly invoiceSyncCron: InvoiceSyncCron,
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

  @Post('overdue-clients/search')
  @HttpCode(200)
  @ApiOperation({ summary: 'Lista clientes vencidos a partir do snapshot local de faturas' })
  async searchOverdueClients(
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
    const account = String(body.account ?? '').trim();
    if (!account) {
      throw new BadRequestException('Account é obrigatório.');
    }

    const safePage = Math.max(1, Number(body.page ?? 1));
    const safeLimit = Math.min(100, Math.max(1, Number(body.limit ?? 24)));
    const skip = (safePage - 1) * safeLimit;
    const query = String(body.query ?? '').trim();
    const normalizedQuery = query.replace(/\D/g, '');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaySql = today.toISOString().split('T')[0];
    const dueDateSql = this.getInvoiceDueDateSql('invoice.expiration');
    const amountSql = this.getInvoiceAmountSql('invoice.value');

    const agingMin = body.agingMin != null ? Number(body.agingMin) : null;
    const agingMax = body.agingMax != null ? Number(body.agingMax) : null;
    const debtMin = body.debtMin != null ? Number(body.debtMin) : null;
    const debtMax = body.debtMax != null ? Number(body.debtMax) : null;
    const hasStructuredFilter = agingMin != null || agingMax != null || debtMin != null || debtMax != null;

    const baseQuery = this.clientRepo
      .createQueryBuilder('client')
      .innerJoin('client.company', 'company')
      .innerJoin(
        'client.invoices',
        'invoice',
        `LOWER(TRIM(invoice.status)) = 'a receber' AND ${dueDateSql} < :today`,
        { today: todaySql },
      )
      .where('company.account_chatwoot = :account', { account });

    if (query) {
      baseQuery.andWhere(
        new Brackets((qb) => {
          qb.where('client.name ILIKE :query', { query: `%${query}%` })
            .orWhere('client.whatsapp ILIKE :query', { query: `%${query}%` });

          if (normalizedQuery) {
            qb.orWhere(
              "regexp_replace(client.cnpj_cpf, '\\D', '', 'g') ILIKE :normalizedQuery",
              { normalizedQuery: `%${normalizedQuery}%` },
            );
          }
        }),
      );
    }

    const [summaryRow, mappedClients, checkedClients, clientsWithSnapshot, clientsWithOpenInvoices] =
      await Promise.all([
        baseQuery
          .clone()
          .select('COUNT(DISTINCT client.id)', 'totalClients')
          .addSelect('COUNT(invoice.id)', 'totalInvoices')
          .addSelect(`COALESCE(SUM(${amountSql}), 0)`, 'totalDebt')
          .getRawOne<{ totalClients: string; totalInvoices: string; totalDebt: string }>(),
        this.clientRepo
          .createQueryBuilder('client')
          .innerJoin('client.company', 'company')
          .where('company.account_chatwoot = :account', { account })
          .getCount(),
        this.clientRepo
          .createQueryBuilder('client')
          .innerJoin('client.company', 'company')
          .where('company.account_chatwoot = :account', { account })
          .andWhere('client.invoiceSnapshotCheckedAt IS NOT NULL')
          .getCount(),
        this.clientRepo
          .createQueryBuilder('client')
          .innerJoin('client.company', 'company')
          .innerJoin('client.invoices', 'invoice')
          .where('company.account_chatwoot = :account', { account })
          .select('client.id')
          .distinct(true)
          .getCount(),
        this.clientRepo
          .createQueryBuilder('client')
          .innerJoin('client.company', 'company')
          .innerJoin('client.invoices', 'invoice', "LOWER(TRIM(invoice.status)) = 'a receber'")
          .where('company.account_chatwoot = :account', { account })
          .select('client.id')
          .distinct(true)
          .getCount(),
      ]);

    // Grouped query with optional HAVING for aging/debt filters
    const groupedQuery = baseQuery
      .clone()
      .select('client.id', 'id')
      .addSelect(`MIN(${dueDateSql})`, 'oldestExpiration')
      .groupBy('client.id');

    if (agingMin != null) {
      groupedQuery.andHaving(`MAX(CURRENT_DATE - ${dueDateSql}) >= :agingMin`, { agingMin });
    }
    if (agingMax != null) {
      groupedQuery.andHaving(`MAX(CURRENT_DATE - ${dueDateSql}) <= :agingMax`, { agingMax });
    }
    if (debtMin != null) {
      groupedQuery.andHaving(`SUM(${amountSql}) >= :debtMin`, { debtMin });
    }
    if (debtMax != null) {
      groupedQuery.andHaving(`SUM(${amountSql}) <= :debtMax`, { debtMax });
    }

    groupedQuery.orderBy(`MIN(${dueDateSql})`, 'ASC');

    let total: number;
    let clientIds: string[];

    if (hasStructuredFilter) {
      const allRows = await groupedQuery.getRawMany<{ id: string; oldestExpiration: string }>();
      total = allRows.length;
      clientIds = allRows.slice(skip, skip + safeLimit).map((row) => row.id);
    } else {
      const [count, pageRows] = await Promise.all([
        baseQuery.clone().select('client.id').distinct(true).getCount(),
        groupedQuery.offset(skip).limit(safeLimit).getRawMany<{ id: string; oldestExpiration: string }>(),
      ]);
      total = count;
      clientIds = pageRows.map((row) => row.id);
    }

    if (!clientIds.length) {
      return {
        data: [],
        page: safePage,
        limit: safeLimit,
        total,
      };
    }

    const clients = await this.clientRepo.find({
      where: { id: In(clientIds) },
      relations: ['company', 'services', 'invoices'],
    });

    const positionById = new Map(clientIds.map((id, index) => [id, index]));

    const data = clients
      .map((client) => {
        const overdueInvoices = (client.invoices ?? [])
          .filter((invoice) => {
            const safeStatus = String(invoice.status ?? '').trim().toLowerCase();
            return safeStatus === 'a receber' && this.isInvoiceOverdue(invoice.expiration, today);
          })
          .sort((a, b) => {
            const first = this.parseInvoiceDate(a.expiration)?.getTime() ?? Number.MAX_SAFE_INTEGER;
            const second = this.parseInvoiceDate(b.expiration)?.getTime() ?? Number.MAX_SAFE_INTEGER;
            return first - second;
          });

        return {
          ...client,
          company: client.company
            ? {
                id: client.company.id,
                name: client.company.name,
                account: client.company.account_chatwoot,
              }
            : null,
          invoices: {
            status: overdueInvoices.length ? 'success' : 'error',
            message: overdueInvoices.length
              ? 'Faturas vencidas encontradas.'
              : 'Nenhuma fatura vencida encontrada.',
            list: overdueInvoices.map((invoice) => ({
              invoice_id: String(invoice.id_fatura ?? ''),
              contract_id: String(invoice.contractId ?? ''),
              invoice_due_date: this.toBrDate(invoice.expiration),
              invoice_amount: String(invoice.value ?? ''),
              invoice_status: invoice.status,
              ticket_digitable_line: invoice.ticketDigitableLine ?? null,
              ticket_pdf_link: invoice.ticketPdfLink ?? null,
              code_pix: invoice.pixCode
                ? { status: 'success', pix: invoice.pixCode }
                : null,
            })),
          },
        };
      })
      .filter((client) => client.invoices.list.length > 0)
      .sort(
        (a, b) =>
          (positionById.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (positionById.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      );

    return {
      data,
      page: safePage,
      limit: safeLimit,
      total,
      summary: {
        totalOverdueClients: Number(summaryRow?.totalClients ?? total),
        totalOverdueInvoices: Number(summaryRow?.totalInvoices ?? 0),
        totalDebt: Number(summaryRow?.totalDebt ?? 0),
        mappedClients,
        checkedClients,
        clientsWithSnapshot,
        clientsWithOpenInvoices,
      },
    };
  }

  @Get('sync-state/:account')
  @HttpCode(200)
  @ApiOperation({ summary: 'Retorna o status da última sincronização de faturas por account' })
  async getSyncState(@Param('account') account: string) {
    const syncState = await this.invoiceSyncCron.getStateByAccount(account);

    if (!syncState?.company) {
      throw new NotFoundException(`Nenhuma empresa encontrada para a account ${account}.`);
    }

    return {
      companyId: syncState.company.id,
      companyName: syncState.company.name,
      account: syncState.company.account_chatwoot,
      status: syncState.status,
      message: syncState.message,
      invoicesSynced: syncState.invoicesSynced,
      lastStartedAt: syncState.lastStartedAt?.toISOString() ?? null,
      lastFinishedAt: syncState.lastFinishedAt?.toISOString() ?? null,
      lastSuccessAt: syncState.lastSuccessAt?.toISOString() ?? null,
      durationMs: syncState.durationMs ? Number(syncState.durationMs) : null,
      updatedAt: syncState.updatedAt?.toISOString() ?? null,
    };
  }

  @Post('sync/company/:companyId')
  @HttpCode(202)
  @ApiOperation({ summary: 'Dispara sincronização manual de faturas da empresa no ERP' })
  async syncCompanyInvoices(@Param('companyId') companyId: string) {
    const company = await this.companyRepo.findOne({
      where: { id: companyId, active: true },
    });

    if (!company) {
      throw new NotFoundException(`Empresa ${companyId} não encontrada.`);
    }

    void this.invoiceSyncCron.syncCompanyById(companyId).catch((error) => {
      this.logger.error(
        `[InvoiceSync] Falha na sincronização manual da empresa ${companyId}: ${error?.message ?? error}`,
      );
    });

    return {
      message: 'Sincronização iniciada.',
      companyId,
      status: 'running',
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

    this.logger.log(`[InvoiceRule] company=${companyId} erp=${clients[0]?.company?.erp} clientes=${clients.length} operator=${filter.operator} daysFrom=${filter.daysFrom ?? 0} daysTo=${filter.daysTo ?? filter.days ?? 0}`);

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
    dueDatesByDispatchDate.forEach((dates, key) => {
      const sorted = [...dates].sort((a, b) => a.localeCompare(b));
      console.log(`[searchInvoicesByCompanyRule] disparo ${key} → janela de vencimento: ${sorted[0]} ~ ${sorted[sorted.length - 1]} (${dates.length} dias)`);
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

      const ixcEntries = [...invoicesByClientId.entries()]
        .map(([ixcClientId, rawInvoices]) => ({ ixcClientId, rawInvoices }))
        .filter(({ ixcClientId }) => clientByIxcId.has(ixcClientId));

      const allInvoiceIds = ixcEntries.flatMap(({ rawInvoices }) =>
        rawInvoices.map((t) => String(t.id)),
      );

      const pixByInvoiceId = new Map<string, { status: string; pix: string }>();
      await Promise.allSettled(
        allInvoiceIds.map(async (invoiceId) => {
          try {
            const pix = await this.ixcService.getPixByInvoice({ companyId: company.id, invoiceId });
            pixByInvoiceId.set(invoiceId, pix);
          } catch {
            pixByInvoiceId.set(invoiceId, { status: 'error', pix: '' });
          }
        }),
      );

      ixcEntries.forEach(({ ixcClientId, rawInvoices }) => {
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
            code_pix: pixByInvoiceId.get(String(t.id)) ?? { status: 'error', pix: '' },
          } as InvoiceMapResultDto;
        });

        dispatchDates.forEach((dispatchDate) => {
          const dueDates = dueDatesByDispatchDate.get(dispatchDate) ?? [];
          const filteredInvoices = filterInvoicesByDueDates(invoiceList, dueDates);

    
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

  private toBrDate(value: string) {
    if (!value) return value;
    if (value.includes('/')) return value;

    const [year, month, day] = value.split('T')[0].split('-');
    if (!year || !month || !day) return value;

    return `${day}/${month}/${year}`;
  }

  private parseInvoiceDate(value: string): Date | null {
    if (!value) return null;

    if (value.includes('/')) {
      const [day, month, year] = value.split('/').map(Number);
      const parsed = new Date(year, month - 1, day);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const [year, month, day] = value.split('T')[0].split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private isInvoiceOverdue(value: string, today: Date) {
    const dueDate = this.parseInvoiceDate(value);
    if (!dueDate) return false;

    dueDate.setHours(0, 0, 0, 0);
    return dueDate < today;
  }

  private getInvoiceDueDateSql(alias: string) {
    return `CASE
      WHEN ${alias} ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN to_date(${alias}, 'DD/MM/YYYY')
      WHEN ${alias} ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN to_date(${alias}, 'YYYY-MM-DD')
      ELSE NULL
    END`;
  }

  private getInvoiceAmountSql(alias: string) {
    return `CASE
      WHEN ${alias} LIKE '%,%' AND ${alias} LIKE '%.%' THEN REPLACE(REPLACE(${alias}, '.', ''), ',', '.')::numeric
      WHEN ${alias} LIKE '%,%' THEN REPLACE(${alias}, ',', '.')::numeric
      WHEN NULLIF(${alias}, '') IS NULL THEN 0
      ELSE ${alias}::numeric
    END`;
  }
}
