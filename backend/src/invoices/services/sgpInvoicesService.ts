import {
  Injectable,
  BadRequestException,
  Logger
} from '@nestjs/common';
import { Company } from '../../companies/entities/companies';
import { Client } from '../../clients/entities.ts/clients';
import { formatarDataBR } from '../../utils';
import { InvoiceMapResultDto, InvoicesResponseDto, InvoiceSearchFilterDto } from '../dto/search.request.dto.invoices';
import { getInvoiceRuleQueryWindow } from '../utils/invoice-rule';
import { RedisService } from '../../redis/redis.service';
import { ErpDefinition } from '../../integrations/erp/erp.types';

const INVOICE_BATCH_CACHE_TTL = 5 * 60; // 5 minutos

/**
 * Capacidades do SGP. Ver `integrations/erp/erp.types.ts`.
 *
 * `preflight: 'counts'` porque `/api/ura/clientes` aceita `limit: 1` com
 * `omitir_titulos: 'sim'` e devolve o total em `paginacao.total` — barato e
 * suficiente para validar credencial e contar.
 */
export const SGP_ERP: ErpDefinition = {
  code: 'SGP',
  label: 'SGP',
  syncClients: true,
  syncInvoices: true,
  pix: true,
  dispatch: true,
  preflight: 'counts',
  credenciais: [
    {
      campo: 'username',
      destino: 'config',
      obrigatorio: true,
      descricao: 'Usuario da API URA do SGP.',
    },
    {
      campo: 'password',
      destino: 'config',
      obrigatorio: true,
      descricao: 'Senha da API URA do SGP.',
    },
  ],
};

@Injectable()
export class SGPInvoicesService {
  private readonly logger = new Logger(SGPInvoicesService.name);

  constructor(
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
        ticket_pdf_link: t.link ? t.link.replace(/\/+$/, '') + '.pdf' : '',
        code_pix: t.codigoPix ?? null
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

    /**
     * Mesmo contrato de tres desfechos usado em `fetchClientsFromSGP`: sucesso,
     * `ilegivel` (HTTP 200 com corpo nao-JSON, causado por um registro que o
     * SGP nao serializa) ou excecao para falha real de rede/HTTP.
     */
    const fetchRange = async (
      offset: number,
      take: number,
    ): Promise<{ titulos: SGPTitleRecord[]; total?: number; ilegivel: boolean }> => {
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
              limit: take,
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

      // Lido como texto de proposito — ver o comentario equivalente em
      // fetchClientsFromSGP.
      const texto = await response.text();
      let data: any;
      try {
        data = JSON.parse(texto);
      } catch {
        return { titulos: [], ilegivel: true };
      }

      return {
        titulos: Array.isArray(data?.titulos) ? data.titulos : [],
        total: data?.paginacao?.total,
        ilegivel: false,
      };
    };

    let pulados = 0;

    /** Divide ao meio ate isolar o(s) titulo(s) que o SGP nao serializa. */
    const recuperarFaixa = async (
      offset: number,
      take: number,
    ): Promise<SGPTitleRecord[]> => {
      if (take <= 1) {
        pulados += 1;
        this.logger.warn(
          `[SGP] ${company.name}: titulo no offset ${offset} e ilegivel (o ERP devolve HTML no lugar de JSON) — pulado.`,
        );
        return [];
      }

      const meio = Math.floor(take / 2);
      const partes = await Promise.all([
        (async () => {
          const r = await fetchRange(offset, meio);
          return r.ilegivel ? recuperarFaixa(offset, meio) : r.titulos;
        })(),
        (async () => {
          const r = await fetchRange(offset + meio, take - meio);
          return r.ilegivel ? recuperarFaixa(offset + meio, take - meio) : r.titulos;
        })(),
      ]);

      return [...partes[0], ...partes[1]];
    };

    const acumular = (titulos: SGPTitleRecord[]) => {
      for (const titulo of titulos) {
        const cpf = String(titulo.clienteCpfcnpj ?? '').replace(/\D/g, '');
        if (!cpf) continue;
        if (!invoicesByCpf.has(cpf)) invoicesByCpf.set(cpf, []);
        invoicesByCpf.get(cpf)!.push(titulo);
      }
    };

    const buscarPagina = async (offset: number): Promise<SGPTitleRecord[]> => {
      const r = await fetchRange(offset, limit);
      if (!r.ilegivel) return r.titulos;

      this.logger.warn(
        `[SGP] ${company.name}: pagina de titulos no offset ${offset} veio ilegivel — isolando os registros problematicos.`,
      );
      return recuperarFaixa(offset, limit);
    };

    // Sem a 1ª página não há total, e sem total não há paginação — aqui a falha
    // precisa subir mesmo.
    const first = await fetchRange(0, limit);
    if (first.ilegivel) {
      throw new Error(
        `SGP titulos — a primeira pagina de ${url} nao devolveu JSON, impossivel descobrir o total.`,
      );
    }

    const total: number = first.total ?? 0;
    acumular(first.titulos);

    if (total > limit) {
      for (let offset = limit; offset < total; offset += limit) {
        acumular(await buscarPagina(offset));
      }
    }

    if (pulados) {
      this.logger.warn(
        `[SGP] ${company.name}: ${pulados} titulo(s) ilegivel(is) pulado(s) de ${total} informados pelo ERP.`,
      );
    }

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

    /**
     * Busca uma faixa. Distingue tres desfechos, porque cada um pede uma
     * reacao diferente:
     *
     * - sucesso;
     * - `ilegivel`: HTTP 200 com corpo que nao e JSON. Acontece quando algum
     *   registro da faixa quebra a serializacao do lado do SGP e ele devolve a
     *   pagina HTML do portal. NAO adianta repetir — e deterministico;
     * - excecao: falha de rede ou HTTP de erro. Continua subindo, porque
     *   credencial invalida ou ERP fora do ar sao problemas reais e nao devem
     *   virar "pulei alguns registros".
     */
    const fetchRange = async (
      offset: number,
      take: number,
    ): Promise<{ clientes: SGPClientRecord[]; total: number; ilegivel: boolean }> => {
      const body: Record<string, string | number> = { offset, limit: take, omitir_titulos: 'sim' };
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

      // Lido como texto de proposito: `response.json()` estourando aqui era o
      // que matava a sincronizacao inteira por causa de um unico registro.
      const texto = await response.text();
      let data: any;
      try {
        data = JSON.parse(texto);
      } catch {
        return { clientes: [], total: 0, ilegivel: true };
      }

      const paginacao = data?.[0]?.paginacao ?? data?.paginacao;
      const clientes: SGPClientRecord[] = data?.[0]?.clientes ?? data?.clientes ?? [];
      return { clientes, total: paginacao?.total ?? clientes.length, ilegivel: false };
    };

    let pulados = 0;

    /**
     * Faixa ilegivel: divide ao meio recursivamente ate isolar o(s) registro(s)
     * que o SGP nao serializa, e devolve todo o resto.
     *
     * Sem isso, um cadastro problematico zera a importacao inteira — foi o que
     * aconteceu com a ADRENALINA NET: 1 registro ruim em 13.752 e nenhum
     * cliente entrava. Com a divisao, ~14 requisicoes extras recuperam 99 dos
     * 100 registros da pagina.
     */
    const recuperarFaixa = async (
      offset: number,
      take: number,
    ): Promise<SGPClientRecord[]> => {
      if (take <= 1) {
        pulados += 1;
        this.logger.warn(
          `[SGP] ${company.name}: registro no offset ${offset} e ilegivel (o ERP devolve HTML no lugar de JSON) — pulado. ` +
            `Corrija o cadastro no SGP para inclui-lo.`,
        );
        return [];
      }

      const meio = Math.floor(take / 2);
      const partes = await Promise.all([
        (async () => {
          const r = await fetchRange(offset, meio);
          return r.ilegivel ? recuperarFaixa(offset, meio) : r.clientes;
        })(),
        (async () => {
          const r = await fetchRange(offset + meio, take - meio);
          return r.ilegivel ? recuperarFaixa(offset + meio, take - meio) : r.clientes;
        })(),
      ]);

      return [...partes[0], ...partes[1]];
    };

    const buscarPagina = async (offset: number): Promise<SGPClientRecord[]> => {
      const r = await fetchRange(offset, limit);
      if (!r.ilegivel) return r.clientes;

      this.logger.warn(
        `[SGP] ${company.name}: pagina no offset ${offset} veio ilegivel — isolando os registros problematicos.`,
      );
      return recuperarFaixa(offset, limit);
    };

    // 1ª página para descobrir o total. Se ela vier ilegível não há como saber
    // o total, então aí sim a sincronização falha — sem total não há paginação.
    const first = await fetchRange(0, limit);
    if (first.ilegivel) {
      throw new Error(
        `SGP clientes — a primeira pagina de ${url} nao devolveu JSON, impossivel descobrir o total.`,
      );
    }

    const total = first.total;
    const allClients: SGPClientRecord[] = [...first.clientes];

    if (total > limit) {
      const offsets: number[] = [];
      for (let offset = limit; offset < total; offset += limit) offsets.push(offset);

      // páginas restantes em paralelo, com concorrência limitada para reduzir timeouts
      for (let i = 0; i < offsets.length; i += concurrency) {
        const batch = offsets.slice(i, i + concurrency);
        const results = await Promise.all(batch.map(buscarPagina));
        results.forEach(clientes => allClients.push(...clientes));
      }
    }

    if (pulados) {
      this.logger.warn(
        `[SGP] ${company.name}: ${pulados} registro(s) ilegivel(is) pulado(s). ` +
          `Importados ${allClients.length} de ${total} informados pelo ERP.`,
      );
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
