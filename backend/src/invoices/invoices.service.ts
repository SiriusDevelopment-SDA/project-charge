import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../clients/entities.ts/clients';
import { Invoice } from './entities/invoices';
import { RedisService } from '../redis/redis.service';
import {
  InvoiceBatchResponseDto,
  InvoiceMapResultDto,
  InvoiceSearchFilterDto,
  InvoicesResponseDto,
  ResultInvoicesDto,
} from './dto/search.request.dto.invoices';
import {
  filterInvoicesByDueDates,
  getInvoiceRuleDueDatesMap,
  getInvoiceRuleReferenceDates,
  normalizeInvoiceDueDateToIso,
} from './utils/invoice-rule';

type InvoiceRule = { operator: string; daysFrom: number; daysTo: number };

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    private readonly redisService: RedisService,
  ) {}

  async searchByCompanyRule(
    companyId: string,
    filter: InvoiceSearchFilterDto,
  ): Promise<InvoiceBatchResponseDto> {
    const clients = await this.clientRepo.find({
      where: { company: { id: companyId } },
      relations: ['company'],
    });

    this.logger.log(
      `[InvoiceRule] company=${companyId} erp=${clients[0]?.company?.erp} clientes=${clients.length} operator=${filter.operator}`,
    );

    if (!clients.length) {
      throw new NotFoundException('Nenhum cliente encontrado para a empresa informada.');
    }

    const erp = String(clients[0]?.company?.erp ?? '').toUpperCase();
    if (!['IXC', 'SGP', 'HUBSOFT', 'MK', 'GAMAISP'].includes(erp)) {
      throw new BadRequestException(
        'Filtro de régua de cobrança disponível apenas para empresas IXC, SGP, HUBSOFT, MK e GAMAISP (snapshot).',
      );
    }

    const dispatchDates = getInvoiceRuleReferenceDates(filter);
    if (!dispatchDates.length) {
      throw new BadRequestException(
        'A régua de cobrança precisa receber ao menos uma data de referência.',
      );
    }

    const dueDatesByDispatchDate = getInvoiceRuleDueDatesMap(filter);
    const allDueFlat = [...new Set([...dueDatesByDispatchDate.values()].flat())].sort((a, b) =>
      a.localeCompare(b),
    );
    const minDue = allDueFlat[0];
    const maxDue = allDueFlat[allDueFlat.length - 1];

    const cacheKey = `invoices:${companyId}:open`;
    const cached = await this.redisService.get<Invoice[]>(cacheKey);
    const open: Invoice[] = cached
      ? cached
      : await this.invoiceRepo.find({
          where: { company: { id: companyId }, status: 'A Receber' },
        });

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
        resultados.map((item) => [`${item.dispatchDate ?? 'all'}:${item.clientData.id}`, item]),
      ).values(),
    ];

    return this.buildBatchResponse(
      uniqueResults,
      [],
      'Clientes encontrados pela régua de cobrança (snapshot).',
      'Nenhum cliente encontrado para os filtros informados.',
    );
  }

  async getRecipientsForDispatchDate(
    companyId: string,
    invoiceRule: InvoiceRule,
    referenceDate: string,
  ): Promise<Record<string, unknown>[]> {
    const filter: InvoiceSearchFilterDto = {
      operator: invoiceRule.operator as InvoiceSearchFilterDto['operator'],
      daysFrom: invoiceRule.daysFrom,
      daysTo: invoiceRule.daysTo,
      referenceDate,
      referenceDates: [referenceDate],
    };

    let result: InvoiceBatchResponseDto;
    try {
      result = await this.searchByCompanyRule(companyId, filter);
    } catch (err) {
      this.logger.warn(
        `[InvoiceRule] getRecipientsForDispatchDate falhou company=${companyId} referenceDate=${referenceDate}: ${(err as Error)?.message}`,
      );
      return [];
    }

    return result.data.map((r) => ({
      clientId: r.clientData.id,
      whatsapp: r.clientData.whatsapp,
      nome_cliente: r.clientData.name,
      cnpj_cpf: r.clientData.cnpj_cpf,
      invoice_id: r.invoices.list[0]?.invoice_id ?? '',
      data_vencimento_fatura: r.invoices.list[0]?.invoice_due_date ?? '',
      valor_fatura: r.invoices.list[0]?.invoice_amount ?? '',
      numero_contrato: r.invoices.list[0]?.contract_id ?? '',
    }));
  }

  async fetchInvoicesFromLocalSnapshot(
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

  mapInvoiceEntityToDto(inv: Invoice): InvoiceMapResultDto {
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

  mapResult(
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

  buildBatchResponse(
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

  normalizeDocumentUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const clean = url.replace(/\/+$/, '');
    const last = clean.split('?')[0].split('/').pop() ?? '';
    return last.includes('.') ? clean : `${clean}.pdf`;
  }

  toBrDate(value: string): string {
    if (!value) return value;
    if (value.includes('/')) return value;
    const [year, month, day] = value.split('T')[0].split('-');
    if (!year || !month || !day) return value;
    return `${day}/${month}/${year}`;
  }

  parseInvoiceDate(value: string): Date | null {
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
}
