import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';

import { Client } from '../../clients/entities.ts/clients';
import { Company } from '../../companies/entities/companies';
import { InvoiceMapResultDto, InvoicesResponseDto } from '../dto/search.request.dto.invoices';
import { HubsoftFatura } from '../types/hubsoftTypes';
import { ErpDefinition } from '../../integrations/erp/erp.types';
import { RedisService } from '../../redis/redis.service';

const INVOICE_BATCH_CACHE_TTL = 5 * 60; // 5 minutos

/**
 * Capacidades do Hubsoft. Ver `integrations/erp/erp.types.ts`.
 *
 * A integracao e completa: `fetchClients` alimenta o `ClientsSyncCron`,
 * `getInvoicesByDateWindowBatch` alimenta o snapshot do `InvoiceSyncCron`, e o
 * disparo le o PIX via `getInvoices` (por cliente).
 *
 * Sobre o PIX: os dois endpoints da Hubsoft usam NOMES DE CAMPO DIFERENTES para
 * o copia-e-cola — a rota por cliente (`cliente/financeiro`) devolve
 * `pix_copia_cola`, e a rota de listagem (`financeiro/fatura`) devolve
 * `pix_copia_e_cola` (com o "e"). Cada metodo le o seu. O valor so vem
 * preenchido quando o provedor emite fatura com PIX: provedores que cobram
 * apenas por boleto (`tipo_cobranca = boleto_bancario`) devolvem o PIX nulo, e
 * nesse caso o disparo cai no boleto (linha digitavel + PDF), que vem populado.
 *
 * `preflight: 'counts'` — `/cliente/todos` com `itens_por_pagina=1` devolve o
 * total em `paginacao.total_registros`, barato o bastante para contar no
 * cadastro.
 */
export const HUBSOFT_ERP: ErpDefinition = {
  code: 'HUBSOFT',
  label: 'Hubsoft',
  syncClients: true,
  syncInvoices: true,
  pix: true,
  dispatch: true,
  preflight: 'counts',
  credenciais: [
    {
      campo: 'client_id',
      destino: 'config',
      obrigatorio: true,
      descricao: 'client_id da aplicação OAuth no Hubsoft.',
    },
    {
      campo: 'client_secret',
      destino: 'config',
      // O service trata ausente como string vazia (`client_secret ?? ''`),
      // então nem toda instalação exige.
      obrigatorio: false,
      descricao: 'client_secret da aplicação OAuth. Opcional em algumas instalações.',
    },
    {
      campo: 'username',
      destino: 'config',
      obrigatorio: true,
      descricao: 'Usuário do grant password.',
    },
    {
      campo: 'password',
      destino: 'config',
      obrigatorio: true,
      descricao: 'Senha do grant password.',
    },
  ],
};

@Injectable()
export class HubsoftInvoicesService {
  private readonly logger = new Logger(HubsoftInvoicesService.name);

  constructor(private readonly redisService: RedisService) {}

  private async sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  private isRetryableNetworkError(err: unknown) {
    const anyErr = err as any;
    const name = anyErr?.name;
    const message = String(anyErr?.message ?? '').toLowerCase();
    return (
      name === 'TimeoutError' ||
      name === 'AbortError' ||
      message.includes('timeout') ||
      message.includes('aborted') ||
      message.includes('fetch failed')
    );
  }

  async gerarTokenOAuth(empresa: Company): Promise<string> {
    const cfg = empresa.config;

    if (!cfg?.client_id || !cfg?.username || !cfg?.password) throw new BadRequestException('Config Hubsoft não encontrada na empresa');

    const tokenUrl = `https://${empresa.url}/oauth/token`;

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: cfg.client_id,
        client_secret: cfg.client_secret ?? '',
        username: cfg.username,
        password: cfg.password,
        grant_type: 'password',
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new BadRequestException(
        `Hubsoft OAuth falhou (${response.status}): ${err}`,
      );
    }

    const data = await response.json();
    return data.access_token;
  }

  /**
   * GET autenticado com retry de rede e timeout. Falha de rede sobe como erro
   * (credencial/host errado ou ERP fora do ar sao problemas reais); corpo
   * nao-JSON tambem sobe, para nao mascarar a pagina de erro do ERP como
   * "nenhum registro".
   */
  private async authedGetJson(
    base: string,
    token: string,
    path: string,
    timeoutMs: number,
    maxRetries: number,
  ): Promise<any> {
    let response: Response | undefined;
    let lastErr: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        response = await fetch(base + path, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
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
      const error = new Error(`Hubsoft — falha de rede ao acessar ${base}${path}`);
      (error as any).cause = lastErr;
      throw error;
    }
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Hubsoft erro ${response.status} em ${path}: ${err.slice(0, 300)}`);
    }

    const texto = await response.text();
    try {
      return JSON.parse(texto);
    } catch {
      throw new Error(`Hubsoft — resposta não-JSON em ${path}: ${texto.slice(0, 200)}`);
    }
  }

  /**
   * Faturas em aberto de UM cliente, ao vivo — usado pelo disparo para montar o
   * payload do template na hora do envio. PIX vem em `pix_copia_cola`.
   */
  async getInvoices(cliente: Client): Promise<InvoicesResponseDto> {
    const token = await this.gerarTokenOAuth(cliente.company);

    const url = `https://${cliente.company.url}/api/v1/integracao/cliente/financeiro`;
    const params = `busca=cpf_cnpj&termo_busca=${cliente.cnpj_cpf.replace(/\D/g, '')}&apenas_pendente=sim&order_by=data_vencimento&order_type=desc`
    const response = await fetch(`${url}?${params}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const err = await response.text();
      throw new BadRequestException(`Erro no ERP (HUBSOFT): ${response.status} -> ${err}`);
    }

    const data = await response.json();

    let map: InvoiceMapResultDto[] = []

    map = data.faturas.map((t: HubsoftFatura
    ): InvoiceMapResultDto => ({
      invoice_id: String(t.id_fatura) ?? null,
      contract_id: String(t.cliente.servico.id_cliente_servico) ?? null,
      invoice_due_date: String(t.data_vencimento) ?? null,
      invoice_amount: String(t.valor),
      invoice_status: 'A Receber',
      ticket_digitable_line: t.codigo_barras ?? null,
      ticket_pdf_link: t.link ?? null,
      code_pix: t.pix_copia_cola ?? null,
    })).sort((a: any, b: any) => {
      const parseDate = (str?: string) => {
        if (!str) return 0;
        const [day, month, year] = str.split('/');
        const fullYear = Number(year) < 100 ? 2000 + Number(year) : Number(year);
        return new Date(fullYear, Number(month) - 1, Number(day)).getTime();
      };
      return parseDate(b.invoice_due_date) - parseDate(a.invoice_due_date);
    });

    return {
      status: data.status,
      message: data.msg,
      list: map,
    };
  }

  /**
   * TODOS os clientes do provedor, paginado (`/cliente/todos`, 500 por página).
   *
   * Sempre carga completa: a Hubsoft ignora o filtro de data por
   * `data_atualizacao` (devolve a base inteira), então um "incremental por data"
   * perderia silenciosamente atualizações de telefone/nome em clientes antigos.
   * Como aqui não há chamada de detalhe por registro (ao contrário do MK), varrer
   * a base inteira é barato e, principalmente, correto. Por isso este método
   * ignora `since` — o parâmetro existe só para manter a assinatura dos demais
   * adapters.
   */
  async fetchClients(company: Company, _since?: Date): Promise<HubsoftClientRecord[]> {
    if (!company.url) throw new Error('URL da Hubsoft não configurada');

    const token = await this.gerarTokenOAuth(company);
    const base = `https://${company.url}`;
    const config = typeof company.config === 'string' ? JSON.parse(company.config) : (company.config ?? {});
    const timeoutMs = Number(config?.timeoutMs ?? 90_000);
    const maxRetries = Number(config?.retries ?? 3);
    const itensPorPagina = 500;

    const buscarPagina = (pagina: number) =>
      this.authedGetJson(
        base,
        token,
        `/api/v1/integracao/cliente/todos?pagina=${pagina}&itens_por_pagina=${itensPorPagina}`,
        timeoutMs,
        maxRetries,
      );

    const all: HubsoftClientRecord[] = [];
    const first = await buscarPagina(0);
    all.push(...((first?.clientes as HubsoftClientRecord[]) ?? []));

    const ultimaPagina = Number(first?.paginacao?.ultima_pagina ?? 0);
    for (let pagina = 1; pagina <= ultimaPagina; pagina++) {
      const data = await buscarPagina(pagina);
      all.push(...((data?.clientes as HubsoftClientRecord[]) ?? []));
    }

    return all;
  }

  /**
   * Faturas em aberto por janela de vencimento, para o snapshot
   * (`/financeiro/fatura`, 500 por página). Indexadas por CPF/CNPJ do cliente —
   * o `persistSnapshot` casa por documento, como o SGP. PIX pedido via
   * `exibir_pix_copia_cola=sim` (campo `pix_copia_e_cola`).
   */
  async getInvoicesByDateWindowBatch(
    company: Company,
    startDate: string,
    endDate: string,
  ): Promise<Map<string, HubsoftFaturaListRecord[]>> {
    const cacheKey = `hubsoft:invoice-batch:${company.id}:${startDate}:${endDate}`;
    const cached = await this.redisService.get<[string, HubsoftFaturaListRecord[]][]>(cacheKey);
    if (cached) {
      return new Map(cached);
    }

    if (!company.url) throw new Error('URL da Hubsoft não configurada');

    const token = await this.gerarTokenOAuth(company);
    const base = `https://${company.url}`;
    const config = typeof company.config === 'string' ? JSON.parse(company.config) : (company.config ?? {});
    const timeoutMs = Number(config?.timeoutMs ?? 90_000);
    const maxRetries = Number(config?.retries ?? 3);
    const itensPorPagina = 500;

    const byCpf = new Map<string, HubsoftFaturaListRecord[]>();

    const buscarPagina = (pagina: number) =>
      this.authedGetJson(
        base,
        token,
        `/api/v1/integracao/financeiro/fatura?tipo_data=data_vencimento` +
          `&data_inicio=${startDate}&data_fim=${endDate}` +
          `&apenas_em_aberto=sim&exibir_pix_copia_cola=sim` +
          `&pagina=${pagina}&itens_por_pagina=${itensPorPagina}`,
        timeoutMs,
        maxRetries,
      );

    const acumular = (faturas: HubsoftFaturaListRecord[]) => {
      for (const fatura of faturas) {
        const cpf = String(fatura?.cliente?.cpf_cnpj ?? '').replace(/\D/g, '');
        if (!cpf) continue;
        if (!byCpf.has(cpf)) byCpf.set(cpf, []);
        byCpf.get(cpf)!.push(fatura);
      }
    };

    const first = await buscarPagina(0);
    acumular((first?.faturas as HubsoftFaturaListRecord[]) ?? []);

    const ultimaPagina = Number(first?.paginacao?.ultima_pagina ?? 0);
    for (let pagina = 1; pagina <= ultimaPagina; pagina++) {
      const data = await buscarPagina(pagina);
      acumular((data?.faturas as HubsoftFaturaListRecord[]) ?? []);
    }

    await this.redisService.set(
      cacheKey,
      [...byCpf.entries()],
      INVOICE_BATCH_CACHE_TTL,
    );

    return byCpf;
  }
}

/** Cliente da rota `/api/v1/integracao/cliente/todos`. */
export interface HubsoftClientRecord {
  id_cliente: number;
  codigo_cliente: number;
  nome_razaosocial: string;
  cpf_cnpj: string;
  telefone_primario?: string | null;
  telefone_secundario?: string | null;
  telefone_terciario?: string | null;
  email_principal?: string | null;
  email_secundario?: string | null;
  data_cadastro?: string;
  data_atualizacao?: string;
  ativo?: boolean;
}

/** Fatura da rota `/api/v1/integracao/financeiro/fatura` (listagem/snapshot). */
export interface HubsoftFaturaListRecord {
  id_fatura: number;
  id_cliente_servico?: number | null;
  nosso_numero?: string | null;
  data_vencimento: string;
  valor?: number | string | null;
  valor_original?: number | string | null;
  linha_digitavel?: string | null;
  codigo_barras?: string | null;
  tipo_cobranca?: string | null;
  link?: string | null;
  pix_copia_e_cola?: string | null;
  cliente?: {
    id_cliente?: number;
    codigo_cliente?: number;
    cpf_cnpj?: string;
  } | null;
}
