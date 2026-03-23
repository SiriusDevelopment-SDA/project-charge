import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { Client } from '../../clients/entities.ts/clients';
import { ReqPixInvoice } from '../types';
import { formatarDataBR, formatDateLocal2 } from '../../utils';
import { InjectRepository } from '@nestjs/typeorm';
import { Company } from '../../companies/entities/companies';
import { Raw, Repository } from 'typeorm';
import {
  InvoiceMapResultDto,
  InvoiceOverdueDto,
  InvoiceSearchFilterDto,
  InvoicesOverdueResponseDto,
  InvoicesResponseDto,
  ResultInvoicesOverdueDto,
} from '../dto/search.request.dto.invoices';
import { ResponseFnAReceber } from '../types/ixcTypes';
import { Invoice } from '../entities/invoices';
import { Overdue } from '../entities/Overdue';

type IXCFnAReceberContent = {
  qtype: string;
  query: string;
  oper: string;
  page: string;
  rp: string;
  sortname: string;
  sortorder: string;
  grid_param: string;
};

type IXCFnAReceberRecord = ResponseFnAReceber | { item?: ResponseFnAReceber };

@Injectable()
export class IXCInvoicesService {
  constructor(
    @InjectRepository(Company) private readonly companyRepository: Repository<Company>,
    @InjectRepository(Invoice) private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(Overdue) private readonly overdueRepository: Repository<Overdue>,
    @InjectRepository(Client) private readonly clientRepository: Repository<Client>,
  ) { }

  async getInvoices(
    cliente: Client,
    filter?: InvoiceSearchFilterDto,
  ): Promise<InvoicesResponseDto> {
        const content = this.buildClientInvoicesContent(
          String(cliente.clientId ?? ''),
          filter,
        );

        console.log('[IXCInvoicesService.getInvoices] payload enviado ao IXC', {
          clientId: cliente.clientId,
          companyId: cliente.company?.id,
          filter,
          content,
        });
      
        const empresa = cliente.company;
        const data = await this.requestFnAReceber(empresa, content);
        const records = this.normalizeFnAReceberRecords(data.registros);

        return this.buildInvoicesResponse(empresa.id, records, {
          status: data?.type,
          message: data?.message,
          page: data?.page,
        });
  }

  async searchInvoicesByRule(
    companyId: string,
    filter: InvoiceSearchFilterDto,
  ): Promise<Array<{ clientId: string; invoices: InvoicesResponseDto }>> {
    const empresa = await this.companyRepository.findOne({
      where: { id: companyId },
    });

    if (!empresa) {
      throw new BadRequestException(`EmpresaId: ${companyId} nao encontrado!`);
    }

    const content = this.buildRuleInvoicesContent(filter);

    console.log('[IXCInvoicesService.searchInvoicesByRule] payload enviado ao IXC', {
      companyId,
      filter,
      content,
    });

    const data = await this.requestFnAReceber(empresa, content);
    const registros = this.normalizeFnAReceberRecords(data.registros);
    const groupedRecords = new Map<string, ResponseFnAReceber[]>();

    if (registros.length) {
      console.log('[IXCInvoicesService.searchInvoicesByRule] amostra do retorno normalizado do IXC', {
        firstRecord: registros[0],
      });
    }

    registros.forEach((record) => {
      const clientId = String(record.id_cliente ?? '').trim();
      if (!clientId) {
        return;
      }

      const current = groupedRecords.get(clientId) ?? [];
      current.push(record);
      groupedRecords.set(clientId, current);
    });

    console.log('[IXCInvoicesService.searchInvoicesByRule] resumo do retorno do IXC', {
      companyId,
      totalRegistros: registros.length,
      totalClientes: groupedRecords.size,
      clientIds: [...groupedRecords.keys()].slice(0, 20),
    });

    return Promise.all(
      [...groupedRecords.entries()].map(async ([clientId, clientRecords]) => ({
        clientId,
        invoices: await this.buildInvoicesResponse(empresa.id, clientRecords, {
          status: data?.type,
          message: data?.message,
          page: data?.page,
        }),
      })),
    );
  }

  private buildClientInvoicesContent(
    clientId: string,
    filter?: InvoiceSearchFilterDto,
  ): IXCFnAReceberContent {
    return {
      qtype: 'fn_areceber.id_cliente',
      query: clientId,
      oper: '=',
      page: '1',
      rp: '700',
      sortname: 'fn_areceber.data_vencimento',
      sortorder: 'asc',
      grid_param: JSON.stringify(this.buildGridParam(filter)),
    };
  }

  private buildRuleInvoicesContent(
    filter: InvoiceSearchFilterDto,
  ): IXCFnAReceberContent {
    return {
      qtype: 'fn_areceber.id_cliente',
      query: '1',
      oper: '>=',
      page: '1',
      rp: '700',
      sortname: 'fn_areceber.data_vencimento',
      sortorder: 'asc',
      grid_param: JSON.stringify(this.buildGridParam(filter)),
    };
  }

  private async requestFnAReceber(
    empresa: Company,
    content: IXCFnAReceberContent,
  ): Promise<{
    type?: 'success' | 'error';
    message?: string;
    page?: unknown;
    registros?: IXCFnAReceberRecord[];
  }> {
    const authorizationHeader = `Basic ${Buffer.from(empresa.autorization).toString('base64')}`;
    const url = `https://${empresa.url}/webservice/v1/fn_areceber`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authorizationHeader,
        'Content-Type': 'application/json',
        'ixcsoft': 'listar'
      },
      body: JSON.stringify(content),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new BadRequestException(
        `Erro no ERP (IXC): ${response.status} -> ${err}`,
      );
    }

    return response.json();
  }

  private normalizeFnAReceberRecords(
    records?: IXCFnAReceberRecord[],
  ): ResponseFnAReceber[] {
    if (!Array.isArray(records)) {
      return [];
    }

    return records
      .map((record) => {
        if (!record || typeof record !== 'object') {
          return null;
        }

        if ('item' in record && record.item && typeof record.item === 'object') {
          return record.item as ResponseFnAReceber;
        }

        return record as ResponseFnAReceber;
      })
      .filter((record): record is ResponseFnAReceber => {
        return Boolean(
          record &&
            typeof record === 'object' &&
            (record.id_cliente || record.id || record.data_vencimento),
        );
      });
  }

  private async buildInvoicesResponse(
    companyId: string,
    records?: ResponseFnAReceber[],
    metadata?: {
      status?: 'success' | 'error';
      message?: string;
      page?: unknown;
    },
  ): Promise<InvoicesResponseDto> {
    const list = await this.mapInvoices(records ?? [], companyId);

    return Object.assign(new InvoicesResponseDto(), {
      status: metadata?.status ?? "success",
      message:
        metadata?.message ??
        (metadata?.page ? "Dados consultados com sucesso" : "Falha ao consultar dados!"),
      list,
    });
  }

  private async mapInvoices(
    records: ResponseFnAReceber[],
    companyId: string,
  ): Promise<InvoiceMapResultDto[]> {
    const map = await Promise.all(
      records.map(async (t): Promise<InvoiceMapResultDto> => {
        const contractId =
          t.id_contrato && t.id_contrato !== "" && t.id_contrato !== "0"
            ? t.id_contrato
            : t.id_contrato_principal && t.id_contrato_principal !== "" && t.id_contrato_principal !== "0"
            ? t.id_contrato_principal
            : t.id_contrato_avulso && t.id_contrato_avulso !== "" && t.id_contrato_avulso !== "0"
            ? t.id_contrato_avulso
            : null;

        const pix = await this.getPixByInvoice({
          companyId,
          invoiceId: String(t.id),
        });

        return {
          invoice_id: String(t.id) ?? null,
          contract_id: String(contractId),
          invoice_due_date: formatarDataBR(t.data_vencimento) ?? null,
          invoice_amount: String(t.valor_aberto),
          invoice_status: 'A Receber',
          ticket_digitable_line: null,
          ticket_pdf_link: null,
          code_pix: pix,
        };
      }),
    );

    map.sort((a, b) => {
      const parseDate = (str?: string) => {
        if (!str) return 0;
        const [day, month, year] = str.split('/');
        const fullYear = Number(year) < 100 ? 2000 + Number(year) : Number(year);
        return new Date(fullYear, Number(month) - 1, Number(day)).getTime();
      };
      return parseDate(b.invoice_due_date) - parseDate(a.invoice_due_date);
    });

    return map;
  }

  private buildGridParam(filter?: InvoiceSearchFilterDto) {
    const baseFilters = [
      { TB: 'fn_areceber.liberado', OP: '=', P: 'S' },
      { TB: 'fn_areceber.status', OP: '=', P: 'A' },
    ];

    if (!filter) {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 33);

      return [
        ...baseFilters,
        {
          TB: 'fn_areceber.data_vencimento',
          OP: '<=',
          P: formatDateLocal2(endDate),
        },
      ];
    }

    const selectedDispatchDate = this.parseReferenceDate(filter.referenceDate);
    const selectedDispatchKey = formatDateLocal2(selectedDispatchDate);
    const inclusiveThresholdDate = this.shiftDays(
      selectedDispatchDate,
      -(filter.days - 1),
    );
    const inclusiveThresholdKey = formatDateLocal2(inclusiveThresholdDate);

    if (filter.operator === 'greater_than') {
      return [
        ...baseFilters,
        {
          TB: 'fn_areceber.data_vencimento',
          OP: '<',
          P: inclusiveThresholdKey,
        },
      ];
    }

    if (filter.operator === 'greater_or_equal') {
      return [
        ...baseFilters,
        {
          TB: 'fn_areceber.data_vencimento',
          OP: '<=',
          P: inclusiveThresholdKey,
        },
      ];
    }

    if (filter.operator === 'less_or_equal') {
      return [
        ...baseFilters,
        {
          TB: 'fn_areceber.data_vencimento',
          OP: 'BE',
          P: selectedDispatchKey,
          P2: inclusiveThresholdKey,
        },
      ];
    }

    if (filter.days <= 1) {
      return [
        ...baseFilters,
        {
          TB: 'fn_areceber.data_vencimento',
          OP: '=',
          P: '1900-01-01',
        },
      ];
    }

    const strictThresholdDate = this.shiftDays(
      selectedDispatchDate,
      -(filter.days - 1),
    );

    return [
      ...baseFilters,
      {
        TB: 'fn_areceber.data_vencimento',
        OP: 'BE',
        P: selectedDispatchKey,
        P2: formatDateLocal2(strictThresholdDate),
      },
    ];
  }

  private parseReferenceDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    parsed.setHours(0, 0, 0, 0);

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      !Number.isInteger(day) ||
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day
    ) {
      throw new BadRequestException('Data de referencia da regua invalida.');
    }

    return parsed;
  }

  private shiftDays(date: Date, amount: number) {
    const shiftedDate = new Date(date);
    shiftedDate.setDate(shiftedDate.getDate() + amount);
    shiftedDate.setHours(0, 0, 0, 0);
    return shiftedDate;
  }

  async getPixByInvoice(data: ReqPixInvoice) {
    

    try {
      const empresa = await this.companyRepository.findOne({ where: { id: data.companyId } });
      if (!empresa) throw new BadRequestException(`EmpresaId: ${data.companyId} nÃ£o encontrado!`);
      const authorizationHeader = `Basic ${Buffer.from(empresa.autorization).toString('base64')}`;
      const url = `https://${empresa.url}/webservice/v1/get_pix`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: authorizationHeader,
          'Content-Type': 'application/json',
          'ixcsoft': 'listar'
        },
        body: JSON.stringify({ id_areceber: data.invoiceId }),
      });
      const boletoData = await response.json();
      const dadosPix = boletoData.pix?.dadosPix ?? {};
      const pixCode = (dadosPix.pixCopiaECola && dadosPix.status === "ATIVA")
        ? dadosPix.pixCopiaECola
        : boletoData.pix?.qrCode?.qrcode ?? "";

      return {
        status: boletoData.type,
        pix: pixCode,
      };
    } catch (err: any) {
      throw new BadRequestException(
        `${err.message ? err.message : "Falha ao encontrar boleto!"}`,
      );
    }
  }

  async getInvoicesOverdue(companyId: string): Promise<ResultInvoicesOverdueDto[]> {
    try {

      const clients = await this.clientRepository.find({
        where: {
          company: {
            id: companyId
          }
        },
        relations: ['company'],
      })

      const resultados: ResultInvoicesOverdueDto[] = [];
      const overdueToSave: Overdue[] = [];
      const now = new Date();

      for (const cliente of clients) {
        const normalized = cliente.cnpj_cpf.replace(/\D/g, '');

        const invoices = await this.invoiceRepository.find({
          where: {
            company: {
              id: cliente.company.id
            },
            client: Raw(
              (alias: string) => `regexp_replace(${alias}, '\\D', '', 'g') = :doc`,
              { doc: normalized }
            )
          }
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const list: InvoiceOverdueDto[] = invoices
          .filter((inv) => {
            if (!inv.expiration) return false;

            const due = new Date(inv.expiration);
            due.setHours(0, 0, 0, 0)

            const status = inv.status?.trim().toLowerCase();

            return status === 'a receber' && due < today;
          })
          .map((inv) => {
            overdueToSave.push({
              invoiceId: String(inv.id_fatura ?? inv.id),
              client: normalized,
              companyId: cliente.company.id,
              dueDate: new Date(inv.expiration),
            } as Overdue)

            return {
              invoice_due_date: inv.expiration,
              invoice_status: inv.status as 'A Receber' | 'Pago' | 'Renegociado' | 'Perdido',
              overdue: true,
            };
          });

        if (!list.length) continue;

        resultados.push({
          client: cliente.name,
          document: normalized,
          erp: cliente.company.erp,
          invoices: {
            status: 'success',
            message: 'Faturas inadimplentes encontradas',
            list,
          } as InvoicesOverdueResponseDto
        });
      }

      if (overdueToSave.length) {
        await this.overdueRepository.upsert(overdueToSave, ['invoiceId', 'companyId'])
      }

      return resultados;

    } catch (error) {
      console.error('[getInvoicesOverdue]', error);

      return [];
    }
  }
}
