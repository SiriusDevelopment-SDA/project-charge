import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { Client } from '../../clients/entities.ts/clients';
import { ReqPixInvoice } from '../types';
import { formatarDataBR, formatDateLocal2 } from '../../utils';
import { InjectRepository } from '@nestjs/typeorm';
import { Company } from '../../companies/entities/companies';
import { Repository } from 'typeorm';
import {
  InvoiceMapResultDto,
  InvoiceSearchFilterDto,
  InvoicesResponseDto,
} from '../dto/search.request.dto.invoices';
import { ResponseFnAReceber } from '../types/ixcTypes';
import { getInvoiceRuleQueryWindow } from '../utils/invoice-rule';
import { RedisService } from '../../redis/redis.service';

const INVOICE_BATCH_CACHE_TTL = 5 * 60; // 5 minutos

@Injectable()
export class IXCInvoicesService {
  constructor(
    @InjectRepository(Company) private readonly companyRepository: Repository<Company>,
    private readonly redisService: RedisService,
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
    const cacheKey = `ixc:invoice-batch:${company.id}:${startDate}:${endDate}`;
    const cached = await this.redisService.get<[string, ResponseFnAReceber[]][]>(cacheKey);
    if (cached) {
      return new Map(cached);
    }

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
      page++;
    }

    await this.redisService.set(cacheKey, [...invoicesByClientId.entries()], INVOICE_BATCH_CACHE_TTL);

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

  async fetchClientsFromIXC(company: Company, since?: Date): Promise<IXCClientRecord[]> {
    const authorizationHeader = `Basic ${Buffer.from(company.autorization).toString('base64')}`;
    const url = `https://${company.url}/webservice/v1/cliente`;
    const allClients: IXCClientRecord[] = [];
    let page = 1;
    const rp = 1000;

    const toIXCDate = (d: Date) =>
      `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

    while (true) {
      const body: any = {
        qtype: 'cliente.ativo',
        query: 'S',
        oper: '=',
        page: String(page),
        rp: String(rp),
        sortname: 'cliente.id',
        sortorder: 'asc',
      };

      if (since) {
        body.grid_param = JSON.stringify([{
          TB: 'cliente.data_cadastro',
          OP: 'BE',
          P: toIXCDate(since),
          P2: toIXCDate(new Date()),
        }]);
      }

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
