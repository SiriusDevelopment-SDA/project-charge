import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { DateTime } from "luxon";
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";
import { Company } from "../../companies/entities/companies";
import { Client } from "../../clients/entities.ts/clients";
import { Invoice } from "../entities/invoices";
import { RedisService } from "../../redis/redis.service";
import {
  InvoiceMapResultDto,
  InvoiceSearchFilterDto,
  InvoicesResponseDto,
} from "../dto/search.request.dto.invoices";
import { getInvoiceRuleQueryWindow } from "../utils/invoice-rule";
import { ErpDefinition } from "../../integrations/erp/erp.types";

/**
 * Capacidades do MK / Proxer. Ver `integrations/erp/erp.types.ts`.
 *
 * `preflight: 'credential'` — a autenticação (`WSAutenticacao.rule`) valida a
 * credencial, mas nenhuma rotina do MK expõe total: `WSMKConsultaClientes` e
 * `WSMKFaturasAbertas` devolvem array puro, sem metadado de paginação. Contar
 * exigiria varrer o cursor inteiro, o que não cabe num preflight.
 */
export const MK_ERP: ErpDefinition = {
  code: "MK",
  label: "MK / Proxer",
  syncClients: true,
  syncInvoices: true,
  pix: true,
  dispatch: true,
  preflight: "credential",
  ressalva:
    "Fica fora do ciclo de faturas de 10 minutos por custo; sincroniza no ciclo diário das 4h e no disparo manual.",
  credenciais: [
    {
      campo: "sys",
      destino: "config",
      obrigatorio: true,
      descricao: "Identificador do sistema no MK (ex.: MK0).",
    },
    {
      campo: "password",
      destino: "config",
      obrigatorio: true,
      descricao: "Senha da integração MK.",
    },
    {
      campo: "cd_servico",
      destino: "config",
      obrigatorio: true,
      descricao: "Código do serviço autorizado no MK.",
    },
    {
      campo: "masterToken",
      destino: "config",
      obrigatorio: true,
      descricao:
        "Token mestre usado em WSAutenticacao.rule para emitir o token de sessão.",
    },
  ],
};

// Margem de segurança aplicada ao TTL do token de sessão, para renovar antes
// de o ERP de fato expirar o token e evitar 401 no meio de uma sincronização.
const MK_TOKEN_TTL_MARGIN_SECONDS = 300;
// Fallback de TTL quando não conseguimos parsear/calcular o "Expire" da resposta.
const MK_TOKEN_FALLBACK_TTL_SECONDS = 24 * 60 * 60; // 1 dia
// Teto de iterações da paginação por cursor, para nunca cair em loop infinito.
const MK_CLIENTS_PAGINATION_MAX_ITERATIONS = 10_000;
// TTL do cache Redis do snapshot de faturas em lote (mesmo padrão do SGP/IXC).
const MK_INVOICE_BATCH_CACHE_TTL = 5 * 60; // 5 minutos

// Status que a MK/PROXER reporta nas faturas. O `status` da WSMKFaturasAbertas
// reflete a situação do CLIENTE/contrato (não o pagamento) — a própria rota já
// retorna só faturas em aberto. Valores reais observados na base (amostra de
// ~128k faturas): "Ativo" (~82k), "Cancelado" (~46k), "Suspenso" (~157).
// Regra (CONFIRMADA com o negócio): cobrar "Ativo" + "Suspenso" (suspenso
// normalmente é inadimplência → cobrável) e descartar "Cancelado" (serviço
// cancelado, não cobrar). "Pago/Baixado" ficam como defesa caso a MK passe a
// reportá-los.
const MK_CLOSED_STATUSES = new Set(
  ["Cancelado", "Cancelada", "Pago", "Paga", "Baixado", "Baixada"].map((s) =>
    s.toLowerCase(),
  ),
);

@Injectable()
export class MkInvoicesService {
  private readonly logger = new Logger("[MK] MkInvoicesService");

  constructor(private readonly redisService: RedisService) {}

  private async sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  /**
   * A API da MK/PROXER emite JSON malformado para acentos: o content-type diz
   * `iso-8859-1`, mas cada caractere acentuado vem como o 1º byte UTF-8 CRU
   * (ex.: 0xC3) seguido do 2º byte como escape JSON `\u00XX` (ex.: "").
   * Resultado: nem UTF-8 nem latin1 puros recuperam o texto. O conserto é:
   *   1) decodificar o corpo em latin1 (preserva os bytes crus e os escapes),
   *   2) `JSON.parse` (desfaz os escapes \u00XX -> code points 0x80-0xFF),
   *   3) reinterpretar os code points de cada string como bytes UTF-8.
   * Assim "INFORMAÇÃO" (que chega quebrado) volta correto. Crítico porque o
   * nome do cliente vai nas mensagens de cobrança. SOMENTE no adapter MK.
   */
  private async parseJsonLatin1<T = unknown>(response: Response): Promise<T> {
    const buf = await response.arrayBuffer();
    const parsed = JSON.parse(Buffer.from(buf).toString("latin1"));
    return this.repairMkEncoding(parsed) as T;
  }

  /**
   * Reinterpreta recursivamente os code points de cada string como bytes UTF-8
   * (ver `parseJsonLatin1`). Strings com code point > 0xFF não cabem em 1 byte
   * e são deixadas intactas (não fazem parte do padrão quebrado da MK).
   */
  private repairMkEncoding(value: unknown): unknown {
    if (typeof value === "string") {
      for (let i = 0; i < value.length; i++) {
        if (value.charCodeAt(i) > 0xff) return value;
      }
      return Buffer.from(value, "latin1").toString("utf8");
    }
    if (Array.isArray(value)) return value.map((v) => this.repairMkEncoding(v));
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(value as Record<string, unknown>)) {
        out[k] = this.repairMkEncoding((value as Record<string, unknown>)[k]);
      }
      return out;
    }
    return value;
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

  private parseConfig(company: Company): MkConfig {
    const config =
      typeof company.config === "string"
        ? JSON.parse(company.config)
        : (company.config ?? {});

    const sys = config.sys;
    const password = config.password;
    const cd_servico = config.cd_servico;
    const masterToken = config.masterToken;

    if (!sys || !password || !cd_servico || !masterToken) {
      throw new BadRequestException(
        "[MK] Credenciais da MK/PROXER não configuradas (sys/password/cd_servico/masterToken)",
      );
    }
    if (!company.url) {
      throw new BadRequestException("[MK] URL da MK/PROXER não configurada");
    }

    return { sys, password, cd_servico, masterToken, config };
  }

  /**
   * Converte o campo `Expire` (formato "DD/MM/YYYY HH:mm:ss") da resposta de
   * autenticação em um TTL em segundos, descontando a margem de segurança.
   * Retorna `null` quando a data é inválida ou o TTL resultante não é positivo,
   * para que o chamador aplique o fallback.
   */
  private computeTokenTtlSeconds(expire?: string): number | null {
    if (!expire) return null;
    const expireDate = DateTime.fromFormat(
      expire.trim(),
      "dd/MM/yyyy HH:mm:ss",
    );
    if (!expireDate.isValid) return null;
    const ttl =
      Math.floor(expireDate.diffNow("seconds").seconds) -
      MK_TOKEN_TTL_MARGIN_SECONDS;
    return ttl > 0 ? ttl : null;
  }

  /**
   * Obtém o token de sessão da MK/PROXER. O `masterToken` é fixo; já o token de
   * sessão expira, então é cacheado no Redis com TTL derivado do campo `Expire`.
   * Sequência: lê do Redis -> se ausente, autentica, parseia o TTL e cacheia.
   */
  private async getSessionToken(company: Company): Promise<string> {
    const cacheKey = `mk:session-token:${company.id}`;
    const cached = await this.redisService.get<string>(cacheKey);
    if (cached) return cached;

    const { sys, password, cd_servico, masterToken } =
      this.parseConfig(company);
    const url =
      `https://${company.url}/mk/WSAutenticacao.rule` +
      `?sys=${encodeURIComponent(sys)}` +
      `&password=${encodeURIComponent(password)}` +
      `&cd_servico=${encodeURIComponent(String(cd_servico))}` +
      `&token=${encodeURIComponent(masterToken)}`;

    const timeoutMs = Number((company.config as any)?.timeoutMs ?? 90_000);
    const maxRetries = Number((company.config as any)?.retries ?? 3);

    let response: Response | undefined;
    let lastErr: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        response = await fetch(url, {
          method: "POST",
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
      throw new BadRequestException(
        `[MK] Falha na autenticação: erro de rede ao acessar ${url} -> ${String((lastErr as any)?.message ?? lastErr)}`,
      );
    }
    if (!response.ok) {
      const errText = await response.text();
      throw new BadRequestException(
        `[MK] Falha na autenticação: erro ${response.status} -> ${errText.slice(0, 300)}`,
      );
    }

    const data = await this.parseJsonLatin1<MkAuthResponse>(response);
    if (data?.status !== "OK" || !data?.Token) {
      throw new BadRequestException(
        `[MK] Falha na autenticação: ${JSON.stringify(data).slice(0, 300)}`,
      );
    }

    const ttlSeconds =
      this.computeTokenTtlSeconds(data.Expire) ?? MK_TOKEN_FALLBACK_TTL_SECONDS;
    await this.redisService.set(cacheKey, data.Token, ttlSeconds);
    this.logger.log(
      `Token de sessão renovado para company=${company.id} (TTL=${ttlSeconds}s)`,
    );

    return data.Token;
  }

  private async invalidateSessionToken(company: Company): Promise<void> {
    await this.redisService.del(`mk:session-token:${company.id}`);
  }

  /**
   * Busca todos os clientes da MK/PROXER paginando por cursor (`cd_cliente_inicio`).
   *
   * Paginação defensiva: começa em 0 e, a cada página, avança o cursor para
   * (maior CodigoPessoa retornado + 1). Encerra quando a página vem vazia ou
   * quando não há CodigoPessoa novo maior que o cursor atual (evita loop). Um
   * teto de iterações protege contra APIs que devolvam tudo de uma vez sem
   * respeitar o cursor.
   *
   * Em caso de erro de autenticação/401 no meio, o token cacheado é invalidado
   * e a autenticação é tentada novamente uma vez.
   */
  async fetchClients(
    company: Company,
    _since?: Date,
  ): Promise<MkClientRecord[]> {
    const { sys, config } = this.parseConfig(company);
    const timeoutMs = Number(config?.timeoutMs ?? 90_000);
    const maxRetries = Number(config?.retries ?? 3);

    const all: MkClientRecord[] = [];
    const seenCodes = new Set<number>();
    let cursor = 0;
    let authRetried = false;

    for (
      let iteration = 0;
      iteration < MK_CLIENTS_PAGINATION_MAX_ITERATIONS;
      iteration++
    ) {
      const sessionToken = await this.getSessionToken(company);
      const url =
        `https://${company.url}/mk/WSMKConsultaClientes.rule` +
        `?sys=${encodeURIComponent(sys)}` +
        `&token=${encodeURIComponent(sessionToken)}` +
        `&cd_cliente_inicio=${cursor}`;

      let response: Response | undefined;
      let lastErr: unknown;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          response = await fetch(url, {
            method: "GET",
            signal: AbortSignal.timeout(timeoutMs),
          });
          lastErr = undefined;
          break;
        } catch (err: any) {
          lastErr = err;
          if (attempt >= maxRetries || !this.isRetryableNetworkError(err))
            break;
          await this.sleep(800 * (attempt + 1) ** 2);
        }
      }

      if (!response) {
        const error = new Error(
          `[MK] clientes — falha de rede ao acessar ${url}`,
        );
        (error as any).cause = lastErr;
        throw error;
      }

      // Token de sessão expirado/inválido: invalida cache e renova 1x.
      if (response.status === 401 && !authRetried) {
        authRetried = true;
        await this.invalidateSessionToken(company);
        this.logger.warn(
          `Token de sessão inválido (401) para company=${company.id}; renovando e tentando novamente`,
        );
        continue; // refaz a mesma página com token novo, sem avançar o cursor
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new BadRequestException(
          `[MK] clientes erro ${response.status} em ${url}: ${errText.slice(0, 300)}`,
        );
      }

      const data = await this.parseJsonLatin1<unknown>(response);
      const page: MkClientRecord[] = Array.isArray(data) ? data : [];

      if (!page.length) break; // página vazia -> fim da paginação

      // Avança o cursor para o maior CodigoPessoa desta página + 1.
      let maxCode = cursor - 1;
      for (const record of page) {
        const code = Number(record?.CodigoPessoa);
        if (!Number.isFinite(code)) continue;
        if (!seenCodes.has(code)) {
          seenCodes.add(code);
          all.push(record);
        }
        if (code > maxCode) maxCode = code;
      }

      const nextCursor = maxCode + 1;
      // Sem CodigoPessoa novo maior que o cursor atual -> evita loop infinito.
      if (nextCursor <= cursor) break;
      cursor = nextCursor;
    }

    return all;
  }

  /**
   * Mapeia um registro de cliente da MK/PROXER para o formato de upsert do Client.
   * Retorna `null` quando faltam dados obrigatórios (CPF/CNPJ ou telefone),
   * para que o chamador conte como "ignorado".
   */
  toClientUpsert(
    record: MkClientRecord,
    company: Company,
  ): QueryDeepPartialEntity<Client> | null {
    const cnpj_cpf = String(record.CPF_CNPJ ?? "").replace(/\D/g, "");
    if (!cnpj_cpf) return null;

    const whatsapp = String(record.Fone ?? "").replace(/\D/g, "");
    if (!whatsapp) return null;

    // Endereço: prefere o item marcado como COBRANCA, senão o primeiro.
    const enderecos = Array.isArray(record.endereco) ? record.endereco : [];
    const endereco =
      enderecos.find((e) => e?.tipo === "COBRANCA") ?? enderecos[0];

    const email = record.Email;

    return {
      cnpj_cpf,
      name: record.Nome?.trim(),
      clientId: String(record.CodigoPessoa),
      whatsapp,
      ...(email && { email }),
      ...(endereco?.logradouro && { street: endereco.logradouro }),
      ...(endereco?.numero != null && { numberHouse: String(endereco.numero) }),
      ...(endereco?.cidade && { city: endereco.cidade }),
      ...(endereco?.cep && {
        zipCode: String(endereco.cep).replace(/\D/g, "").slice(0, 9),
      }),
      companyId: company.id,
    };
  }

  /**
   * Formata uma data para o formato DD/MM/YYYY exigido pelos endpoints de
   * faturas da MK/PROXER (WSMKFaturasAbertas).
   */
  formatSyncDate(date: Date): string {
    return DateTime.fromJSDate(date).toFormat("dd/MM/yyyy");
  }

  /**
   * Indica se um status retornado pela WSMKFaturasAbertas representa uma fatura
   * "fechada" (cancelada/paga/baixada) e que portanto deve ser descartada.
   * Comparação case-insensitive; faturas sem status são tratadas como abertas.
   */
  private isClosedStatus(status?: string): boolean {
    const normalized = String(status ?? "")
      .trim()
      .toLowerCase();
    if (!normalized) return false;
    return MK_CLOSED_STATUSES.has(normalized);
  }

  /**
   * GET genérico com retry/backoff e timeout no estilo do SGP. Renova o token de
   * sessão 1x em caso de 401. Retorna o JSON parseado.
   */
  private async fetchJsonWithRetry(
    company: Company,
    buildUrl: (sessionToken: string) => string,
    label: string,
  ): Promise<any> {
    const { config } = this.parseConfig(company);
    const timeoutMs = Number(config?.timeoutMs ?? 90_000);
    const maxRetries = Number(config?.retries ?? 3);

    let authRetried = false;

    // Loop externo apenas para permitir uma única renovação de token em 401.
    for (let authAttempt = 0; authAttempt < 2; authAttempt++) {
      const sessionToken = await this.getSessionToken(company);
      const url = buildUrl(sessionToken);

      let response: Response | undefined;
      let lastErr: unknown;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          response = await fetch(url, {
            method: "GET",
            signal: AbortSignal.timeout(timeoutMs),
          });
          lastErr = undefined;
          break;
        } catch (err: any) {
          lastErr = err;
          if (attempt >= maxRetries || !this.isRetryableNetworkError(err))
            break;
          await this.sleep(800 * (attempt + 1) ** 2);
        }
      }

      if (!response) {
        const error = new Error(
          `[MK] ${label} — falha de rede ao acessar ${url}`,
        );
        (error as any).cause = lastErr;
        throw error;
      }

      if (response.status === 401 && !authRetried) {
        authRetried = true;
        await this.invalidateSessionToken(company);
        this.logger.warn(
          `Token de sessão inválido (401) em ${label} para company=${company.id}; renovando e tentando novamente`,
        );
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new BadRequestException(
          `[MK] ${label} erro ${response.status}: ${errText.slice(0, 300)}`,
        );
      }

      return this.parseJsonLatin1<unknown>(response);
    }

    throw new BadRequestException(
      `[MK] ${label}: falha de autenticação após renovar o token de sessão`,
    );
  }

  /**
   * Busca o detalhe (2ª via) de uma fatura individual via WSMKSegundaViaCobranca.
   * Traz `Vcto` (vencimento) e `PathDownload` (PDF do boleto), que NÃO vêm na
   * lista de WSMKFaturasAbertas. Retorna `null` quando o detalhe não estiver
   * disponível para não derrubar o lote inteiro.
   *
   * TODO: confirmar com o usuário se WSMKSegundaViaCobranca aceita múltiplos
   * cd_fatura numa só chamada — hoje buscamos 1 detalhe por fatura (com
   * concorrência limitada). Se aceitar lote, dá para reduzir o nº de chamadas.
   */
  private async fetchInvoiceDetail(
    company: Company,
    sys: string,
    cdFatura: number | string,
  ): Promise<MkInvoiceDetail | null> {
    try {
      const data: MkInvoiceDetail = await this.fetchJsonWithRetry(
        company,
        (token) =>
          `https://${company.url}/mk/WSMKSegundaViaCobranca.rule` +
          `?sys=${encodeURIComponent(sys)}` +
          `&token=${encodeURIComponent(token)}` +
          `&cd_fatura=${encodeURIComponent(String(cdFatura))}`,
        "detalhe da fatura",
      );
      return data ?? null;
    } catch (err) {
      this.logger.warn(
        `Falha ao buscar detalhe da fatura cd_fatura=${cdFatura} (company=${company.id}): ${(err as Error)?.message}`,
      );
      return null;
    }
  }

  /**
   * Extrai o código PIX (copia-e-cola) da resposta da WSMKRetornarCopieColaPix.
   *
   * Shape de SUCESSO (validado ao vivo): `{ codpessoa, nome_razaosocial,
   * status_contrato, texto_qrcode }` — o copia-e-cola (BR Code) está em
   * `texto_qrcode`.
   * Shape de ERRO conhecido: `{ codigo_erro, mensagem, status: "ERRO" }`
   * — ex.: conta sem PIX habilitado. Nesse caso → null.
   */
  private extractPixCode(response: unknown): string | null {
    if (!response || typeof response !== "object") return null;
    const obj = response as Record<string, unknown>;

    // Resposta de erro da MK (status "ERRO" / codigo_erro) → sem PIX.
    if (
      String(obj.status ?? "").toUpperCase() === "ERRO" ||
      obj.codigo_erro != null
    ) {
      return null;
    }

    const texto = obj.texto_qrcode;
    if (typeof texto === "string" && texto.trim()) return texto.trim();
    return null;
  }

  /**
   * Busca o código PIX (copia-e-cola) de uma fatura via WSMKRetornarCopieColaPix.
   * O endpoint é por `CodigoFatura` (= cd_fatura/id_fatura), NÃO por documento, e
   * o copia-e-cola vem em `texto_qrcode` (validado ao vivo). Funciona apenas com
   * o token de sessão. É buscado on-demand no disparo (NÃO no snapshot) para não
   * dobrar o volume da sync. Esta chamada é isolada e NUNCA derruba o fluxo de
   * disparo — retorna `null` em qualquer falha (o boleto PDF já cobre).
   */
  async fetchPixByInvoice(
    company: Company,
    cdFatura: string,
  ): Promise<string | null> {
    const codigoFatura = String(cdFatura ?? "").trim();
    if (!codigoFatura) return null;

    try {
      const { sys } = this.parseConfig(company);
      const data = await this.fetchJsonWithRetry(
        company,
        (token) =>
          `https://${company.url}/mk/WSMKRetornarCopieColaPix.rule` +
          `?sys=${encodeURIComponent(sys)}` +
          `&token=${encodeURIComponent(token)}` +
          `&CodigoFatura=${encodeURIComponent(codigoFatura)}`,
        "PIX por fatura",
      );
      return this.extractPixCode(data);
    } catch (err) {
      this.logger.warn(
        `Falha ao buscar PIX da fatura cd_fatura=${codigoFatura} (company=${company.id}): ${(err as Error)?.message}`,
      );
      return null;
    }
  }

  /**
   * Executa `task` sobre `items` com concorrência limitada (estilo SGP), para
   * não sobrecarregar a API da MK ao buscar detalhe fatura-a-fatura.
   */
  private async runWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    task: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let cursor = 0;
    const limit = Math.max(1, concurrency);

    const worker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) break;
        results[index] = await task(items[index]);
      }
    };

    const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
      worker(),
    );
    await Promise.all(workers);
    return results;
  }

  /**
   * Busca todas as faturas em aberto numa janela de vencimento e as indexa por
   * código do cliente (codpessoa = client.clientId), como o IXC faz por
   * id_cliente. Fluxo: WSMKFaturasAbertas (lista) -> filtra status fechados ->
   * busca o detalhe (WSMKSegundaViaCobranca) de cada fatura em lotes com
   * concorrência limitada -> mescla Vcto/PathDownload no registro. Cacheia o
   * resultado no Redis (TTL ~5min) como o SGP.
   *
   * @param startDate vencimento inicial em DD/MM/YYYY
   * @param endDate   vencimento final em DD/MM/YYYY
   */
  async getInvoicesByDateWindowBatch(
    company: Company,
    startDate: string,
    endDate: string,
  ): Promise<Map<string, MkInvoiceRecord[]>> {
    const cacheKey = `mk:invoice-batch:${company.id}:${startDate}:${endDate}`;
    const cached =
      await this.redisService.get<[string, MkInvoiceRecord[]][]>(cacheKey);
    if (cached) {
      return new Map(cached);
    }

    const { sys, config } = this.parseConfig(company);
    const concurrency = Number(config?.invoicesConcurrency ?? 6);

    const listResponse: MkFaturasAbertasResponse =
      await this.fetchJsonWithRetry(
        company,
        (token) =>
          `https://${company.url}/mk/WSMKFaturasAbertas.rule` +
          `?sys=${encodeURIComponent(sys)}` +
          `&token=${encodeURIComponent(token)}` +
          `&dt_venc_inicio=${encodeURIComponent(startDate)}` +
          `&dt_venc_fim=${encodeURIComponent(endDate)}`,
        "faturas abertas",
      );

    const lista = Array.isArray(listResponse?.ListaFaturas)
      ? listResponse.ListaFaturas
      : [];

    const open = lista.filter((item) => !this.isClosedStatus(item?.status));

    this.logger.log(
      `[InvoiceBatch] company=${company.id} janela=${startDate}..${endDate} ` +
        `lista=${lista.length} abertas=${open.length}`,
    );

    // Busca o detalhe de cada fatura em lotes com concorrência limitada.
    const detailed = await this.runWithConcurrency(
      open,
      concurrency,
      async (item): Promise<MkInvoiceRecord> => {
        const detail = await this.fetchInvoiceDetail(
          company,
          sys,
          item.cd_fatura,
        );
        return {
          cd_fatura: item.cd_fatura,
          codpessoa: item.codpessoa,
          nome: item.nome,
          status: item.status,
          valor: item.valor,
          Vcto: detail?.Vcto,
          PathDownload: detail?.PathDownload,
          Valor: detail?.Valor,
        };
      },
    );

    // Faturas cujo detalhe (WSMKSegundaViaCobranca) falhou ficam sem `Vcto` e
    // serão descartadas pelo `toInvoiceUpsert` (snapshot exige vencimento). Conta
    // e loga o total por sync para não descartar silenciosamente.
    const droppedNoVcto = detailed.filter((record) => !record.Vcto).length;
    if (droppedNoVcto > 0) {
      this.logger.warn(
        `[InvoiceBatch] company=${company.id} janela=${startDate}..${endDate} ` +
          `${droppedNoVcto} fatura(s) descartada(s) por falta de vencimento ` +
          `(detalhe WSMKSegundaViaCobranca indisponível).`,
      );
    }

    const invoicesByClientId = new Map<string, MkInvoiceRecord[]>();
    for (const record of detailed) {
      const clientId = String(record.codpessoa);
      if (!clientId) continue;
      if (!invoicesByClientId.has(clientId)) {
        invoicesByClientId.set(clientId, []);
      }
      invoicesByClientId.get(clientId)!.push(record);
    }

    await this.redisService.set(
      cacheKey,
      [...invoicesByClientId.entries()],
      MK_INVOICE_BATCH_CACHE_TTL,
    );

    return invoicesByClientId;
  }

  /**
   * Mapeia um registro de fatura da MK/PROXER (lista + detalhe mesclados) para o
   * formato de upsert do snapshot de Invoice. Mesmo shape do SGP. Retorna `null`
   * quando não há vencimento (Vcto) — sem vencimento a fatura não é utilizável
   * pela régua de cobrança.
   */
  toInvoiceUpsert(
    rawInvoice: MkInvoiceRecord,
    context: { clientId: string; companyId: string; syncTime: Date },
  ): QueryDeepPartialEntity<Invoice> | null {
    if (!rawInvoice?.Vcto) return null;

    return {
      id_fatura: String(rawInvoice.cd_fatura),
      contractId: undefined,
      value: String(rawInvoice.valor ?? "0"),
      status: "A Receber",
      expiration: rawInvoice.Vcto,
      ticketDigitableLine: null,
      ticketPdfLink: rawInvoice.PathDownload ?? null,
      // PIX fica null no snapshot de propósito: é buscado on-demand no disparo
      // (fetchPixByInvoice por CodigoFatura) para não dobrar o volume da sync.
      pixCode: null,
      lastSyncAt: context.syncTime,
      clientId: context.clientId,
      companyId: context.companyId,
    };
  }

  /**
   * Disparo manual: consulta faturas em aberto de UM cliente (por codpessoa =
   * client.clientId), busca o detalhe de cada uma (Vcto/PathDownload) e mapeia
   * para o DTO de resposta. Espelha o SGP/IXC. Erros de credencial viram
   * BadRequestException via parseConfig/getSessionToken.
   */
  async getInvoices(
    cliente: Client,
    filter?: InvoiceSearchFilterDto,
  ): Promise<InvoicesResponseDto> {
    const company = cliente.company;
    const { sys, config } = this.parseConfig(company);
    const concurrency = Number(config?.invoicesConcurrency ?? 6);

    const invoiceRuleWindow = getInvoiceRuleQueryWindow(filter);
    const endDate = invoiceRuleWindow
      ? this.isoToBrDate(invoiceRuleWindow.endDate)
      : this.formatSyncDate(new Date());
    const startDate = invoiceRuleWindow
      ? this.isoToBrDate(invoiceRuleWindow.startDate)
      : this.formatSyncDate(
          (() => {
            const date = new Date();
            date.setFullYear(date.getFullYear() - 50);
            return date;
          })(),
        );

    // Filtro por cliente NO LADO DO ERP: a WSMKFaturasAbertas aceita `cd_pessoa`
    // (= codpessoa = client.clientId). Sem ele, a rota devolve TODAS as faturas
    // da janela (a base inteira) e o filtro ficava só na memória — o que fazia o
    // MK gravar respostas gigantes por requisição (coluna `par_saida`) e pesar o
    // servidor da PROXER. Com `cd_pessoa` a resposta volta só as faturas do
    // cliente, igual ao IXC (id_cliente) e ao SGP (cpfcnpj). Descoberto ao vivo
    // em 2026-07-29: janela 20-31/07 sem filtro=2851 faturas; com
    // cd_pessoa=<cliente> caiu para as faturas do próprio cliente (7).
    const clientId = String(cliente.clientId);

    const listResponse: MkFaturasAbertasResponse =
      await this.fetchJsonWithRetry(
        company,
        (token) =>
          `https://${company.url}/mk/WSMKFaturasAbertas.rule` +
          `?sys=${encodeURIComponent(sys)}` +
          `&token=${encodeURIComponent(token)}` +
          `&dt_venc_inicio=${encodeURIComponent(startDate)}` +
          `&dt_venc_fim=${encodeURIComponent(endDate)}` +
          `&cd_pessoa=${encodeURIComponent(clientId)}`,
        "faturas abertas",
      );

    const lista = Array.isArray(listResponse?.ListaFaturas)
      ? listResponse.ListaFaturas
      : [];

    // Mantém o filtro por codpessoa como rede de segurança (caso o ERP ignore o
    // cd_pessoa em algum cenário) + descarta status fechado. Dedupe por cd_fatura
    // porque a WSMKFaturasAbertas às vezes repete a mesma fatura na lista (visto
    // ao vivo: uma fatura vindo 3x), o que dobraria as chamadas de detalhe/PIX.
    const seenFatura = new Set<string>();
    const own = lista.filter((item) => {
      if (String(item?.codpessoa) !== clientId) return false;
      if (this.isClosedStatus(item?.status)) return false;
      const key = String(item?.cd_fatura);
      if (seenFatura.has(key)) return false;
      seenFatura.add(key);
      return true;
    });

    const detailed = await this.runWithConcurrency(
      own,
      concurrency,
      async (item): Promise<MkInvoiceRecord> => {
        // No disparo manual buscamos detalhe + PIX juntos (no mesmo lote
        // concorrente) para o code_pix já vir preenchido — diferente do
        // snapshot diário, que mantém pixCode null por volume.
        const [detail, pix] = await Promise.all([
          this.fetchInvoiceDetail(company, sys, item.cd_fatura),
          this.fetchPixByInvoice(company, String(item.cd_fatura)),
        ]);
        return {
          cd_fatura: item.cd_fatura,
          codpessoa: item.codpessoa,
          nome: item.nome,
          status: item.status,
          valor: item.valor,
          Vcto: detail?.Vcto,
          PathDownload: detail?.PathDownload,
          Valor: detail?.Valor,
          pix: pix ?? undefined,
        };
      },
    );

    const list: InvoiceMapResultDto[] = detailed
      .map(
        (record): InvoiceMapResultDto => ({
          invoice_id: String(record.cd_fatura),
          contract_id: "",
          invoice_due_date: record.Vcto ?? null,
          invoice_amount: String(record.valor ?? ""),
          invoice_status: "A Receber",
          ticket_digitable_line: "",
          ticket_pdf_link: record.PathDownload ?? null,
          // PIX já buscado junto do detalhe (texto_qrcode via fetchPixByInvoice).
          code_pix: record.pix ?? null,
        }),
      )
      .sort((a, b) => {
        const parseDate = (str?: string | null) => {
          if (!str) return 0;
          const [day, month, year] = str.split("/");
          const fullYear =
            Number(year) < 100 ? 2000 + Number(year) : Number(year);
          return new Date(fullYear, Number(month) - 1, Number(day)).getTime();
        };
        return parseDate(b.invoice_due_date) - parseDate(a.invoice_due_date);
      });

    return Object.assign(new InvoicesResponseDto(), {
      status: "success",
      message: "Dados consultados com sucesso",
      list,
    });
  }

  /** Converte uma data ISO (YYYY-MM-DD) para o formato DD/MM/YYYY da MK. */
  private isoToBrDate(iso: string): string {
    const [year, month, day] = String(iso ?? "").split("-");
    if (!year || !month || !day) return iso;
    return `${day}/${month}/${year}`;
  }
}

interface MkConfig {
  sys: string;
  password: string;
  cd_servico: string | number;
  masterToken: string;
  config: Record<string, any>;
}

interface MkAuthResponse {
  Expire?: string;
  LimiteUso?: number;
  ServicosAutorizados?: number[];
  Token?: string;
  status?: string;
}

export interface MkEnderecoRecord {
  bairro?: string;
  cep?: string;
  cidade?: string;
  complemento?: string | null;
  estado?: string;
  logradouro?: string;
  numero?: number | null;
  tipo?: string;
}

export interface MkClientRecord {
  CPF_CNPJ: string;
  CodigoPessoa: number;
  Email?: string;
  Fone?: string;
  Nome?: string;
  Situacao?: string;
  contratos?: any[];
  endereco?: MkEnderecoRecord[];
}

/** Item da WSMKFaturasAbertas (lista por janela de vencimento). */
interface MkFaturaAbertaItem {
  cd_fatura: number;
  codpessoa: number;
  nome?: string;
  status?: string;
  valor?: number;
}

interface MkFaturasAbertasResponse {
  ListaFaturas?: MkFaturaAbertaItem[];
}

/** Detalhe da WSMKSegundaViaCobranca (2ª via por cd_fatura). */
interface MkInvoiceDetail {
  CodigoPessoa?: number;
  Fatura?: string;
  PathDownload?: string;
  Valor?: string;
  Vcto?: string;
  status?: string;
}

/**
 * Registro de fatura da MK/PROXER usado pelo snapshot e pelo disparo.
 * Mescla campos da lista (WSMKFaturasAbertas) com os do detalhe
 * (WSMKSegundaViaCobranca): `valor` é numérico (da lista) e `Valor` é a string
 * formatada "R$ x,xx" (do detalhe). Não há linha digitável nem PIX neste shape.
 */
export interface MkInvoiceRecord {
  cd_fatura: number;
  codpessoa: number;
  nome?: string;
  status?: string;
  valor?: number;
  // Campos provenientes do detalhe (WSMKSegundaViaCobranca):
  Vcto?: string;
  PathDownload?: string;
  Valor?: string;
  // PIX copia-e-cola (texto_qrcode) — preenchido só no disparo manual (getInvoices),
  // não no snapshot diário (volume).
  pix?: string;
}
