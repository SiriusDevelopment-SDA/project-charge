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
import { InvoicesService } from '../invoices.service';
import {
  InvoiceBatchPartialDto,
  PixBatchRequestDto,
  ResultInvoicesDto,
  SearchRequestInvoicesDto,
} from '../dto/search.request.dto.invoices';

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
    private readonly invoicesService: InvoicesService,
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
      return this.invoicesService.searchByCompanyRule(data.companyId, data.filter);
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

        const invoices = await this.invoicesService.fetchInvoicesFromLocalSnapshot(cliente, data.filter);
        resultados.push(this.invoicesService.mapResult(cliente, normalizedQuery, invoices));
      } catch {
        errors.push({
          document: doc,
          reason: 'Erro inesperado ao processar o cliente',
        });
      }
    }

    return this.invoicesService.buildBatchResponse(resultados, errors);
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

    type StaticStats = { mappedClients: number; checkedClients: number; clientsWithSnapshot: number; clientsWithOpenInvoices: number };
    const staticStatsKey = `invoices:${account}:summary-stats`;

    const [summaryRow, cachedStaticStats] = await Promise.all([
      baseQuery
        .clone()
        .select('COUNT(DISTINCT client.id)', 'totalClients')
        .addSelect('COUNT(invoice.id)', 'totalInvoices')
        .addSelect(`COALESCE(SUM(${amountSql}), 0)`, 'totalDebt')
        .getRawOne<{ totalClients: string; totalInvoices: string; totalDebt: string }>(),
      this.redisService.get<StaticStats>(staticStatsKey),
    ]);

    let mappedClients: number;
    let checkedClients: number;
    let clientsWithSnapshot: number;
    let clientsWithOpenInvoices: number;

    if (cachedStaticStats) {
      ({ mappedClients, checkedClients, clientsWithSnapshot, clientsWithOpenInvoices } = cachedStaticStats);
    } else {
      [mappedClients, checkedClients, clientsWithSnapshot, clientsWithOpenInvoices] = await Promise.all([
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
      await this.redisService.set(staticStatsKey, { mappedClients, checkedClients, clientsWithSnapshot, clientsWithOpenInvoices }, 60);
    }

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
      const cloned = groupedQuery.clone();
      const [countResult, pageRows] = await Promise.all([
        this.clientRepo.manager
          .createQueryBuilder()
          .select('COUNT(*)', 'cnt')
          .from(`(${cloned.getQuery()})`, 'sub')
          .setParameters(cloned.getParameters())
          .getRawOne<{ cnt: string }>(),
        groupedQuery.offset(skip).limit(safeLimit).getRawMany<{ id: string; oldestExpiration: string }>(),
      ]);
      total = parseInt(countResult?.cnt ?? '0', 10);
      clientIds = pageRows.map((row) => row.id);
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

    const [clients, overdueInvoiceRows] = await Promise.all([
      this.clientRepo.find({
        where: { id: In(clientIds) },
        relations: ['company', 'services'],
      }),
      this.invoiceRepo
        .createQueryBuilder('invoice')
        .where('invoice."clientId" IN (:...clientIds)', { clientIds })
        .andWhere("LOWER(TRIM(invoice.status)) = 'a receber'")
        .andWhere(`${this.getInvoiceDueDateSql('invoice.expiration')} < :today`, { today: todaySql })
        .orderBy(this.getInvoiceDueDateSql('invoice.expiration'), 'ASC')
        .getMany(),
    ]);

    const overdueByClientId = new Map<string, typeof overdueInvoiceRows>();
    for (const inv of overdueInvoiceRows) {
      const list = overdueByClientId.get(inv.clientId) ?? [];
      list.push(inv);
      overdueByClientId.set(inv.clientId, list);
    }

    const positionById = new Map(clientIds.map((id, index) => [id, index]));

    const data = clients
      .map((client) => {
        const overdueInvoices = overdueByClientId.get(client.id) ?? [];

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
              invoice_due_date: this.invoicesService.toBrDate(invoice.expiration),
              invoice_amount: String(invoice.value ?? ''),
              invoice_status: invoice.status,
              ticket_digitable_line: invoice.ticketDigitableLine ?? null,
              ticket_pdf_link: this.invoicesService.normalizeDocumentUrl(invoice.ticketPdfLink),
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

  private isInvoiceOverdue(value: string, today: Date) {
    const dueDate = this.invoicesService.parseInvoiceDate(value);
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
