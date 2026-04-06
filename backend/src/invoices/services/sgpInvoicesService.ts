import {
  Injectable,
  BadRequestException
} from '@nestjs/common';
import { Company } from '../../companies/entities/companies';
import { Client } from '../../clients/entities.ts/clients';
import { formatarDataBR } from '../../utils';
import { InvoiceMapResultDto, InvoiceOverdueDto, InvoicesOverdueResponseDto, InvoicesResponseDto, ResultInvoicesOverdueDto } from '../dto/search.request.dto.invoices';
import { InvoiceSearchFilterDto } from '../dto/search.request.dto.invoices';
import { Invoice } from '../entities/invoices';
import { Raw, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Overdue } from '../entities/Overdue';
import { getInvoiceRuleQueryWindow } from '../utils/invoice-rule';
import { RedisService } from '../../redis/redis.service';

const INVOICE_BATCH_CACHE_TTL = 5 * 60; // 5 minutos

@Injectable()
export class SGPInvoicesService {
  overdueRepository: any;
  clientRepository: any;
  constructor(
      @InjectRepository(Invoice) private readonly invoiceRepository: Repository<Invoice>,
      private readonly redisService: RedisService,
    ) { }

  private async sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  private isRetryableNetworkError(err: unknown) {
    const anyErr = err as any;
    const name = anyErr?.name;
    const message = String(anyErr?.message ?? "");
    return (
      name === "TimeoutError" ||
      name === "AbortError" ||
      message.toLowerCase().includes("timeout") ||
      message.toLowerCase().includes("aborted") ||
      message.toLowerCase().includes("fetch failed")
    );
  }
  
  async getInvoices(
    cliente: Client,
    filter?: InvoiceSearchFilterDto,
  ): Promise<InvoicesResponseDto> {
    const empresa = cliente.company;
    const config = empresa.config ?? {};
    const username = config.username;
    const password = config.password;
    if (!username || !password)throw new BadRequestException('Credenciais da SGP não configuradas (username/password)');


    const cpfCliente = String(cliente.cnpj_cpf).replace(/\D/g, '');

    const auth = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

    const url = `https://${empresa.url}/api/ura/titulos`;
    const invoiceRuleWindow = getInvoiceRuleQueryWindow(filter);
    const endDate = invoiceRuleWindow?.endDate ?? new Date().toISOString().split('T')[0];
    const startDate = invoiceRuleWindow?.startDate ?? (() => {
      const date = new Date();
      date.setFullYear(date.getFullYear() - 50);
      return date.toISOString().split('T')[0];
    })();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cpfcnpj: cpfCliente,
        status: 'abertos',
        ordenar: 'data_vencimento',
        ordenar_ordem: 'desc',
        data_vencimento_inicio: startDate,
        data_vencimento_fim: endDate,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new BadRequestException(`Erro no ERP (SGP): ${response.status} -> ${err}`);
    }

    const data = await response.json();
    const titles = Array.isArray(data?.titulos) ? data.titulos : [];
    const map = titles
      .map((t: any): InvoiceMapResultDto => ({
        invoice_id: String(t.id),
        contract_id: String(t.clienteContrato),
        invoice_due_date: formatarDataBR(t.dataVencimento),
        invoice_amount: String(t.valorCorrigido),
        invoice_status: 'A Receber',
        ticket_digitable_line: t.codigoBarras || "",
        ticket_pdf_link: t.link || "",
        code_pix: {
          status: t.codigoPix !== "" ? "success": "error",
          pix: t.codigoPix ?? null
        }
      }))
      .sort((a: any, b: any) => {
        const parseDate = (str?: string) => {
          if (!str) return 0;
          const [day, month, year] = str.split('/');
          const fullYear = Number(year) < 100 ? 2000 + Number(year) : Number(year);
          return new Date(fullYear, Number(month) - 1, Number(day)).getTime();
        };
        return parseDate(b.invoice_due_date) - parseDate(a.invoice_due_date);
      });
    return Object.assign(new InvoicesResponseDto(),{
      status: "success",
      message: "Dados consultados com sucesso",
      list: map,
    });
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
      console.error('[SGPInvoicesService][getInvoicesOverdue]', error);

      return [];
    }
  }

  async getInvoicesByDateWindowBatch(
    company: Company,
    startDate: string,
    endDate: string,
  ): Promise<Map<string, SGPTitleRecord[]>> {
    const cacheKey = `sgp:invoice-batch:${company.id}:${startDate}:${endDate}`;
    const cached = await this.redisService.get<[string, SGPTitleRecord[]][]>(cacheKey);
    if (cached) {
      return new Map(cached);
    }

    const config = typeof company.config === 'string' ? JSON.parse(company.config) : (company.config ?? {});
    const username = config.username;
    const password = config.password;
    if (!username || !password) throw new Error('Credenciais da SGP não configuradas (username/password)');
    if (!company.url) throw new Error('URL da SGP não configurada');

    const auth = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    const url = `https://${company.url}/api/ura/titulos`;
    const limit = 250;
    const invoicesByCpf = new Map<string, SGPTitleRecord[]>();


    const timeoutMs = Number((company.config as any)?.timeoutMs ?? 90_000);
    const maxRetries = Number((company.config as any)?.retries ?? 3);

    const fetchPage = async (offset: number): Promise<{ titulos: SGPTitleRecord[]; total?: number }> => {
      let response: Response | undefined;
      let lastErr: unknown;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: { Authorization: auth, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'abertos',
              data_vencimento_inicio: startDate,
              data_vencimento_fim: endDate,
              offset,
              limit,
            }),
            signal: AbortSignal.timeout(timeoutMs),
          });
          lastErr = undefined;
          break;
        } catch (err: any) {
          lastErr = err;
          if (attempt >= maxRetries || !this.isRetryableNetworkError(err)) break;
          await this.sleep(800 * (attempt + 1) ** 2);
        }
      }

      if (!response) {
        const error = new Error(`SGP titulos — falha de rede ao acessar ${url}`);
        (error as any).cause = lastErr;
        throw error;
      }
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`SGP titulos erro ${response.status}: ${err.slice(0, 300)}`);
      }
      const data = await response.json();
      return {
        titulos: Array.isArray(data?.titulos) ? data.titulos : [],
        total: data?.paginacao?.total,
      };
    };

    const first = await fetchPage(0);
    const total: number = first.total ?? 0;
    const allTitulos: SGPTitleRecord[] = [...first.titulos];


    if (total > limit) {
      const offsets: number[] = [];
      for (let offset = limit; offset < total; offset += limit) offsets.push(offset);

      for (let i = 0; i < offsets.length; i += 20) {
        const batch = offsets.slice(i, i + 20);
        const results = await Promise.all(batch.map(fetchPage));
        results.forEach(r => allTitulos.push(...r.titulos));
      }
    }

    for (const titulo of allTitulos) {
      const cpf = String(titulo.clienteCpfcnpj ?? '').replace(/\D/g, '');
      if (!cpf) continue;
      if (!invoicesByCpf.has(cpf)) invoicesByCpf.set(cpf, []);
      invoicesByCpf.get(cpf)!.push(titulo);
    }

    await this.redisService.set(cacheKey, [...invoicesByCpf.entries()], INVOICE_BATCH_CACHE_TTL);

    return invoicesByCpf;
  }

  async fetchClientsFromSGP(company: Company, since?: Date): Promise<SGPClientRecord[]> {
    const config = typeof company.config === 'string' ? JSON.parse(company.config) : (company.config ?? {});
    const username = config.username;
    const password = config.password;
    if (!username || !password) throw new Error('Credenciais da SGP não configuradas (username/password)');
    if (!company.url) throw new Error('URL da SGP não configurada');

    const auth = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    const url = `https://${company.url}/api/ura/clientes`;
    const limit = 100;
    const timeoutMs = Number(config?.timeoutMs ?? 90_000);
    const maxRetries = Number(config?.retries ?? 3);
    const concurrency = Number(config?.clientsConcurrency ?? 5);

    const fetchPage = async (offset: number): Promise<{ clientes: SGPClientRecord[]; total: number }> => {
      const body: Record<string, string | number> = { offset, limit, omitir_titulos: 'sim' };
      if (since) body['data_cadastro_inicio'] = since.toISOString().split('T')[0];
      let response: Response | undefined;
      let lastErr: unknown;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: { Authorization: auth, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs),
          });
          lastErr = undefined;
          break;
        } catch (err: any) {
          lastErr = err;
          if (attempt >= maxRetries || !this.isRetryableNetworkError(err)) break;
          const backoffMs = 800 * (attempt + 1) ** 2;
          await this.sleep(backoffMs);
        }
      }

      if (!response) {
        const error = new Error(`SGP clientes — falha de rede ao acessar ${url}`);
        (error as any).cause = lastErr;
        throw error;
      }
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`SGP clientes erro ${response.status} em ${url}: ${errText.slice(0, 300)}`);
      }
      const data = await response.json();
      const paginacao = data?.[0]?.paginacao ?? data?.paginacao;
      const clientes: SGPClientRecord[] = data?.[0]?.clientes ?? data?.clientes ?? [];
      return { clientes, total: paginacao?.total ?? clientes.length };
    };

    // 1ª página para descobrir o total
    const first = await fetchPage(0);
    const total = first.total;
    const allClients: SGPClientRecord[] = [...first.clientes];

    if (total > limit) {
      const offsets: number[] = [];
      for (let offset = limit; offset < total; offset += limit) offsets.push(offset);

      // páginas restantes em paralelo, com concorrência limitada para reduzir timeouts
      for (let i = 0; i < offsets.length; i += concurrency) {
        const batch = offsets.slice(i, i + concurrency);
        const results = await Promise.all(batch.map(fetchPage));
        results.forEach(r => allClients.push(...r.clientes));
      }
    }

    return allClients;
  }
}

export interface SGPTitleRecord {
  id: number;
  clienteNome?: string;
  clienteCpfcnpj?: string;
  clienteContrato?: string | number;
  dataVencimento?: string;
  valor?: number;
  valorCorrigido?: number;
  codigoBarras?: string;
  linhaDigitavel?: string;
  codigoPix?: string;
  link?: string;
  link_cobranca?: string;
}

export interface SGPClientRecord {
  id: number;
  nome: string;
  cpfcnpj?: string;
  celular?: string;
  fone?: string;
  whatsapp?: string;
  email?: string;
  contatos?: {
    celulares?: string[];
    telefones?: string[];
    emails?: string[];
    outros?: string[];
  };
  endereco?: {
    logradouro?: string;
    numero?: number;
    cidade?: string;
    cep?: string;
  };
}
