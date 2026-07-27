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
import { ErpDefinition } from '../../integrations/erp/erp.types';

const INVOICE_BATCH_CACHE_TTL = 5 * 60; // 5 minutos

/**
 * Capacidades do IXC. Ver `integrations/erp/erp.types.ts`.
 *
 * `preflight: 'counts'` porque `/webservice/v1/cliente` e `/fn_areceber` aceitam
 * `rp: '1'` e devolvem o total em `data.total` — da para validar credencial e
 * contar registros sem varrer a base.
 */
export const IXC_ERP: ErpDefinition = {
  code: 'IXC',
  label: 'IXC',
  syncClients: true,
  syncInvoices: true,
  pix: true,
  dispatch: true,
  preflight: 'counts',
  credenciais: [
    {
      campo: 'autorization',
      destino: 'autorization',
      obrigatorio: true,
      descricao:
        'Credencial do IXC no formato "id:token" (ex.: 41:89ac11d5...). E enviada como Basic base64 no header Authorization.',
    },
  ],
};

/**
 * Formata uma data para o filtro DATETIME do IXC (`YYYY-MM-DD HH:mm:ss`).
 *
 * A conversao e feita explicitamente para America/Sao_Paulo: o container roda em
 * UTC e o IXC grava/compara em horario de Brasilia, entao formatar com os
 * componentes UTC deslocaria a janela em 3 horas.
 */
export function toIXCDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';

  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

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
        fim.setDate(fim.getDate() + 720)
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
      
              // PIX é buscado sob demanda via /invoices/pix/batch — não carregado aqui para evitar N chamadas ao ERP por fatura
              const pixCode = '';

              return {
                invoice_id: String(t.id) ?? null,
                contract_id: String(contractId),
                invoice_due_date: formatarDataBR(t.data_vencimento) ?? null,
                invoice_amount: String(t.valor_aberto),
                invoice_status: 'A Receber',
                ticket_digitable_line: null,
                ticket_pdf_link: null,
                code_pix: pixCode,
              };
            })
          );
      
          map.sort((a, b) => {
            const parseDate = (str?: string | null) => {
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
        // Filtra por `ultima_atualizacao`, nao por `data_cadastro`: o que
        // interessa no modo incremental e quem MUDOU desde a ultima rodada
        // (telefone novo, reativacao, correcao de CPF), nao apenas quem foi
        // cadastrado. Com `data_cadastro` o cliente existente nunca voltava e a
        // base local acumulava divergencia em relacao ao ERP.
        //
        // O formato importa: `ultima_atualizacao` e DATETIME e so aceita
        // `YYYY-MM-DD HH:mm:ss`. Passando `DD/MM/YYYY` o IXC nao rejeita a
        // requisicao — ele devolve silenciosamente um resultado quase vazio
        // (medido no ERP da UPLINK: 10 registros em BR contra 702 em ISO para a
        // mesma janela de 90 dias).
        body.grid_param = JSON.stringify([{
          TB: 'cliente.ultima_atualizacao',
          OP: 'BE',
          P: toIXCDateTime(since),
          P2: toIXCDateTime(new Date()),
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
