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
import { Invoice } from '../entities/invoices';
import { InvoiceSyncCron } from '../invoice-sync.cron';
import { RedisService } from '../../redis/redis.service';
import { IXCInvoicesService } from '../services/ixcInvoicesService';
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
  normalizeInvoiceDueDateToIso,
} from '../utils/invoice-rule';

@ApiTags('Invoices')
@Controller('invoices')
export class InvoicesController {
  private readonly logger = new Logger(InvoicesController.name);

  constructor(
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly invoiceSyncCron: InvoiceSyncCron,
    private readonly redisService: RedisService,
    private readonly ixcService: IXCInvoicesService,
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

        const invoices = await this.fetchInvoicesFromLocalSnapshot(cliente, data.filter);
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
              ticket_pdf_link: this.normalizeDocumentUrl(invoice.ticketPdfLink),
              code_pix: invoice.pixCode
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

  @Get('open-client-ids/:account')
  @HttpCode(200)
  @ApiOperation({ summary: 'Retorna clientIds com faturas em aberto (lê do cache Redis)' })
  async getOpenClientIds(@Param('account') account: string) {
    const company = await this.companyRepo.findOne({
      where: { account_chatwoot: account },
    });

    if (!company) {
      return { clientIds: [] };
    }

    const cacheKey = `invoices:${company.id}:open`;
    const cached = await this.redisService.get<{ clientId: string }[]>(cacheKey);

    if (cached) {
      const clientIds = [...new Set(cached.map((inv) => inv.clientId).filter(Boolean))];
      return { clientIds };
    }

    const rows = await this.invoiceRepo
      .createQueryBuilder('invoice')
      .select('DISTINCT invoice."clientId"', 'clientId')
      .where('invoice."companyId" = :companyId', { companyId: company.id })
      .andWhere("LOWER(TRIM(invoice.status)) = 'a receber'")
      .getRawMany<{ clientId: string }>();

    return { clientIds: rows.map((r) => r.clientId).filter(Boolean) };
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

  /**
   * Busca códigos PIX pelo ERP para uma lista de invoiceIds.
   * Para IXC: chama o ERP (pixCode não é armazenado no snapshot local).
   * Para SGP/HUBSOFT: lê do snapshot local (pixCode já está no banco).
   */
  @Post('pix/batch')
  @HttpCode(200)
  @ApiOperation({ summary: 'Busca códigos PIX em lote pelo ERP ou snapshot local' })
  @ApiBody({ type: PixBatchRequestDto })
  async getPixBatch(@Body() data: PixBatchRequestDto) {
    const company = await this.companyRepo.findOne({ where: { id: data.companyId } });
    if (!company) throw new NotFoundException(`Empresa ${data.companyId} não encontrada.`);

    const erp = String(company.erp ?? '').toUpperCase();

    if (erp === 'IXC') {
      const settled = await Promise.allSettled(
        data.invoiceIds.map(async (invoiceId) => {
          try {
            const result = await this.ixcService.getPixByInvoice({
              companyId: data.companyId,
              invoiceId,
            });
            return { invoiceId, status: result.status ?? 'success', pix: result.pix ?? '' };
          } catch {
            return { invoiceId, status: 'error', pix: '' };
          }
        }),
      );
      return {
        results: settled.map((r) =>
          r.status === 'fulfilled' ? r.value : { invoiceId: '', status: 'error', pix: '' },
        ),
      };
    }

    // SGP / HUBSOFT: PIX already in local snapshot
    const invoices = await this.invoiceRepo.find({
      where: { id_fatura: In(data.invoiceIds), company: { id: data.companyId } },
      select: { id_fatura: true, pixCode: true },
    });
    const pixByInvoiceId = new Map(
      invoices.map((inv) => [String(inv.id_fatura), inv.pixCode ?? '']),
    );
    return {
      results: data.invoiceIds.map((invoiceId) => ({
        invoiceId,
        status: pixByInvoiceId.has(invoiceId) ? 'success' : 'error',
        pix: pixByInvoiceId.get(invoiceId) ?? '',
      })),
    };
  }

  private async searchInvoicesByCompanyRule(
    companyId: string,
    filter: InvoiceSearchFilterDto,
  ): Promise<InvoiceBatchResponseDto> {
    const clients = await this.clientRepo.find({
      where: { company: { id: companyId } },
      relations: ['company'],
    });

    this.logger.log(
      `[InvoiceRule] company=${companyId} erp=${clients[0]?.company?.erp} clientes=${clients.length} (snapshot DB) operator=${filter.operator}`,
    );

    if (!clients.length) {
      throw new NotFoundException(
        'Nenhum cliente encontrado para a empresa informada.',
      );
    }

    const erp = String(clients[0]?.company?.erp ?? '').toUpperCase();
    if (!['IXC', 'SGP', 'HUBSOFT'].includes(erp)) {
      throw new BadRequestException(
        'Filtro de régua de cobrança disponível apenas para empresas IXC, SGP e HUBSOFT (snapshot).',
      );
    }

    const dispatchDates = getInvoiceRuleReferenceDates(filter);
    if (!dispatchDates.length) {
      throw new BadRequestException(
        'A régua de cobrança precisa receber ao menos uma data de referência.',
      );
    }

    const dueDatesByDispatchDate = getInvoiceRuleDueDatesMap(filter);
    const allDueFlat = [...new Set([...dueDatesByDispatchDate.values()].flat())].sort(
      (a, b) => a.localeCompare(b),
    );
    const minDue = allDueFlat[0];
    const maxDue = allDueFlat[allDueFlat.length - 1];

    const cacheKey = `invoices:${companyId}:open`;
    const cached = await this.redisService.get<Invoice[]>(cacheKey);
    let open: Invoice[];
    if (cached) {
      open = cached;
    } else {
      open = await this.invoiceRepo.find({
        where: { company: { id: companyId }, status: 'A Receber' },
      });
    }

    const inWindow = open.filter((inv) => {
      const iso = normalizeInvoiceDueDateToIso(inv.expiration);
      return iso ? iso >= minDue && iso <= maxDue : false;
    });

    const clientById = new Map(clients.map((c) => [c.id, c]));
    const listsByClientId = new Map<string, InvoiceMapResultDto[]>();

    for (const inv of inWindow) {
      const clientId = inv.clientId;
      if (!clientId) continue;
      const cliente = clientById.get(clientId);
      if (!cliente) continue;
      const dto = this.mapInvoiceEntityToDto(inv);
      const arr = listsByClientId.get(clientId) ?? [];
      arr.push(dto);
      listsByClientId.set(clientId, arr);
    }

    const resultados: ResultInvoicesDto[] = [];

    for (const [clientId, invoiceList] of listsByClientId) {
      const cliente = clientById.get(clientId);
      if (!cliente) continue;
      const normalizedDocument = String(cliente.cnpj_cpf ?? '').replace(/\D/g, '');

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
      [],
      'Clientes encontrados pela régua de cobrança (snapshot).',
      'Nenhum cliente encontrado para os filtros informados.',
    );
  }

  private normalizeDocumentUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const clean = url.replace(/\/+$/, '');
    const last = clean.split('?')[0].split('/').pop() ?? '';
    return last.includes('.') ? clean : `${clean}.pdf`;
  }

  private mapInvoiceEntityToDto(inv: Invoice): InvoiceMapResultDto {
    const brDate = this.toBrDate(inv.expiration);
    return {
      invoice_id: String(inv.id_fatura ?? ''),
      contract_id: String(inv.contractId ?? ''),
      invoice_due_date: brDate,
      invoice_amount: String(inv.value ?? ''),
      invoice_status: inv.status as InvoiceMapResultDto['invoice_status'],
      ticket_digitable_line: inv.ticketDigitableLine ?? null,
      ticket_pdf_link: this.normalizeDocumentUrl(inv.ticketPdfLink),
      code_pix: inv.pixCode ?? null,
    };
  }

  private async fetchInvoicesFromLocalSnapshot(
    cliente: Client,
    filter?: InvoiceSearchFilterDto,
  ): Promise<InvoicesResponseDto> {
    const companyId = cliente.company?.id ?? (cliente as any).companyId;
    const cacheKey = `invoices:${companyId}:open`;
    const cached = await this.redisService.get<Invoice[]>(cacheKey);

    let rows: Invoice[];
    if (cached) {
      rows = cached.filter((inv) => inv.clientId === cliente.id);
    } else {
      rows = await this.invoiceRepo.find({
        where: { clientId: cliente.id, status: 'A Receber' },
      });
    }

    let list: InvoiceMapResultDto[] = rows.map((inv) => this.mapInvoiceEntityToDto(inv));

    if (filter) {
      const allDue = [...new Set([...getInvoiceRuleDueDatesMap(filter).values()].flat())];
      list = filterInvoicesByDueDates(list, allDue);
    }

    // Sort oldest first so list[0] is always the earliest open invoice
    list.sort((a, b) => {
      const aTime = this.parseInvoiceDate(a.invoice_due_date ?? '')?.getTime() ?? 0;
      const bTime = this.parseInvoiceDate(b.invoice_due_date ?? '')?.getTime() ?? 0;
      return aTime - bTime;
    });

    return {
      status: list.length ? 'success' : 'error',
      message: list.length
        ? 'Faturas (snapshot local).'
        : 'Nenhuma fatura aberta no snapshot para este cliente/filtro.',
      list,
    };
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
