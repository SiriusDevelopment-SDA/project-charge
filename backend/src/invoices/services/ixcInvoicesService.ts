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
import { getInvoiceRuleQueryWindow } from '../utils/invoice-rule';

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
        const fim = new Date()
        fim.setDate(fim.getDate() + 33)
        const invoiceRuleWindow = getInvoiceRuleQueryWindow(filter);
        const dueDateFilter = invoiceRuleWindow
          ? {
              TB: 'fn_areceber.data_vencimento',
              OP: 'BE',
              P: invoiceRuleWindow.startDate,
              P2: invoiceRuleWindow.endDate,
            }
          : {
              TB: 'fn_areceber.data_vencimento',
              OP: '<=',
              P: formatDateLocal2(fim),
            };

        const content = {
          qtype: 'fn_areceber.id_cliente',
          query: cliente.clientId.toString(),
          oper: '=',
          page: '1',
          rp: '700',
          sortname: 'fn_areceber.data_vencimento',
          sortorder: 'asc',
          grid_param: JSON.stringify([
            { TB: 'fn_areceber.liberado', OP: '=', P: 'S' },
            { TB: 'fn_areceber.status', OP: 'L', P: 'A' },
            dueDateFilter,
          ]),
        }
      
        const empresa = cliente.company;
        const authorizationHeader = `Basic ${Buffer.from(empresa.autorization).toString('base64')}`;
        const url = `https://${empresa.url}/webservice/v1/fn_areceber`;
      
        console.log(`[IXCInvoicesService] requisição para ${url}`, JSON.stringify(content));
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
      
        const data = await response.json()
        console.log(`[IXCInvoicesService] resposta IXC para cliente ${cliente.name}:`, JSON.stringify({ type: data.type, total: data.total, registros: data.registros?.length ?? 0 }));
        if (data.registros?.length) {
          console.log(`[IXCInvoicesService] datas de vencimento brutas do IXC:`, data.registros.map((r: any) => r.data_vencimento));
        }

        let map: InvoiceMapResultDto[] = []

        if (data.registros) {
          map = await Promise.all(
            data.registros.map(async (t: ResponseFnAReceber): Promise<InvoiceMapResultDto> => {

              const contractId =
                t.id_contrato && t.id_contrato !== "" && t.id_contrato !== "0"
                  ? t.id_contrato
                  : t.id_contrato_principal && t.id_contrato_principal !== "" && t.id_contrato_principal !== "0"
                  ? t.id_contrato_principal
                  : t.id_contrato_avulso && t.id_contrato_avulso !== "" && t.id_contrato_avulso !== "0"
                  ? t.id_contrato_avulso
                  : null;
      
              const pix = await this.getPixByInvoice({
                companyId: empresa.id,
                invoiceId: String(t.id),
              })
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
            })
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
        }
      
        return Object.assign(new InvoicesResponseDto(), {
          status: data?.type ?? "success",
          message: data?.message ?? (data.page ? "Dados consultados com sucesso" : "Falha ao consultar dados!"),
          list: map,
        });
  }

  async getInvoicesByDateWindowBatch(
    company: Company,
    startDate: string,
    endDate: string,
  ): Promise<Map<string, ResponseFnAReceber[]>> {
    const authorizationHeader = `Basic ${Buffer.from(company.autorization).toString('base64')}`;
    const url = `https://${company.url}/webservice/v1/fn_areceber`;

    const gridParam = JSON.stringify([
      { TB: 'fn_areceber.liberado', OP: '=', P: 'S' },
      { TB: 'fn_areceber.status', OP: 'L', P: 'A' },
      { TB: 'fn_areceber.data_vencimento', OP: 'BE', P: startDate, P2: endDate },
    ]);

    const PAGE_SIZE = 1000;
    const invoicesByClientId = new Map<string, ResponseFnAReceber[]>();
    let page = 1;
    let totalFetched = 0;
    let totalAvailable = Infinity;

    console.log(`[IXCInvoicesService] getInvoicesByDateWindowBatch url=${url} janela=${startDate}~${endDate}`);

    while (totalFetched < totalAvailable) {
      const content = {
        qtype: 'fn_areceber.id',
        query: '0',
        oper: '>',
        page: String(page),
        rp: String(PAGE_SIZE),
        sortname: 'fn_areceber.data_vencimento',
        sortorder: 'asc',
        grid_param: gridParam,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: authorizationHeader,
          'Content-Type': 'application/json',
          ixcsoft: 'listar',
        },
        body: JSON.stringify(content),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new BadRequestException(`Erro no ERP (IXC): ${response.status} -> ${err}`);
      }

      const data = await response.json();

      if (page === 1) {
        totalAvailable = Number(data.total ?? 0);
        console.log(`[IXCInvoicesService] total faturas na janela: ${totalAvailable}`);
      }

      const registros: ResponseFnAReceber[] = Array.isArray(data.registros) ? data.registros : [];

      if (!registros.length) break;

      for (const invoice of registros) {
        const clientId = String(invoice.id_cliente);
        if (!invoicesByClientId.has(clientId)) {
          invoicesByClientId.set(clientId, []);
        }
        invoicesByClientId.get(clientId)!.push(invoice);
      }

      totalFetched += registros.length;
      console.log(`[IXCInvoicesService] página ${page}: ${registros.length} faturas (${totalFetched}/${totalAvailable})`);
      page++;
    }

    return invoicesByClientId;
  }

  async getPixByInvoice(data: ReqPixInvoice) {
    

    try {
      const empresa = await this.companyRepository.findOne({ where: { id: data.companyId } });
      if (!empresa) throw new BadRequestException(`EmpresaId: ${data.companyId} não encontrado!`);
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

  async fetchClientsFromIXC(company: Company): Promise<IXCClientRecord[]> {
    const authorizationHeader = `Basic ${Buffer.from(company.autorization).toString('base64')}`;
    const url = `https://${company.url}/webservice/v1/cliente`;
    const allClients: IXCClientRecord[] = [];
    let page = 1;
    const rp = 1000;

    while (true) {
      const body = {
        qtype: 'cliente.ativo',
        query: 'S',
        oper: '=',
        page: String(page),
        rp: String(rp),
        sortname: 'cliente.id',
        sortorder: 'asc',
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: authorizationHeader,
          'Content-Type': 'application/json',
          ixcsoft: 'listar',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`IXC clientes erro ${response.status}: ${errText.slice(0, 300)}`);
      }

      const rawText = await response.text();
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(`IXC clientes retornou conteúdo inválido: ${rawText.slice(0, 300)}`);
      }

      const registros: IXCClientRecord[] = data.registros ?? [];

      allClients.push(...registros);

      if (registros.length < rp) break;
      page++;
    }

    return allClients;
  }
}

export interface IXCClientRecord {
  id: string;
  razao: string;
  cnpj_cpf: string;
  fone_celular?: string;
  telefone_celular?: string;
  whatsapp?: string;
  email?: string;
  endereco?: string;
  numero?: string;
  cidade_descricao?: string;
  cep?: string;
}
