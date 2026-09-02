import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Client } from '../../clients/entities.ts/clients';
import { Company } from '../../companies/entities/companies';
import { Invoice } from '../entities/invoices';
import { RedisService } from '../../redis/redis.service';
import { formatarDataBR } from '../../utils';
import {
  InvoiceMapResultDto,
  InvoicesResponseDto,
} from '../dto/search.request.dto.invoices';
import {
  GamaIspAuthResponse,
  GamaIspCliente,
  GamaIspContato,
  GamaIspEndereco,
  GamaIspFatura,
  GamaIspFaturasResponse,
  GamaIspJwtPayload,
  GamaIspResponse,
} from '../types/gamaIspTypes';
import { ErpDefinition } from '../../integrations/erp/erp.types';

/**
 * Capacidades da Gama ISP. Ver `integrations/erp/erp.types.ts`.
 *
 * Sincroniza clientes e faturas (`fetchClients` + `getInvoicesByDateWindowBatch`,
 * ligados no `ClientsSyncCron` e no `InvoiceSyncCron`) e tambem atende o disparo
 * on-demand por documento. Ou seja: a base local E populada, e a regua de
 * cobranca aceita empresas Gama ISP (`invoices.service.ts`).
 *
 * O QUE TORNA A SINCRONIZACAO POSSIVEL, dado que a API nao tem filtro nenhum (12
 * variacoes testadas em sondagem real) e estoura a memoria do PHP acima de ~116
 * registros por pagina: `order` + `direction` FUNCIONAM. Com
 * `order=data_vencimento&direction=desc` da para caminhar do vencimento mais
 * recente para tras e PARAR ao sair da janela, em vez de varrer as 180 mil
 * faturas. Os clientes (3.998) sao varridos por inteiro, em ~40 paginas.
 *
 * Nao existe sincronizacao INCREMENTAL: sem filtro por data de alteracao, toda
 * rodada de clientes e carga completa. Ver `fetchClients`.
 *
 * `pix: true` — diferente do Hubsoft: o `pix_qrcode` vem no MESMO payload das
 * faturas, CHEGA ao disparo (`template-dispatch-payload.service.ts`) e ainda e
 * gravado no snapshot (`toInvoiceUpsert`), o que faz o `POST /invoices/pix/batch`
 * funcionar pelo ramo do snapshot local, sem chamada extra ao ERP.
 *
 * `preflight: 'credential'` — `POST /api/v1/auth` valida rest_key + login +
 * senha de uma vez. A listagem ate expoe um `total`, mas seria uma SEGUNDA
 * chamada, numa rota que ignora filtro e estoura a memoria do PHP: caro e
 * fragil demais para o caminho sincrono do cadastro.
 */
export const GAMA_ISP_ERP: ErpDefinition = {
  code: 'GAMAISP',
  label: 'Gama ISP',
  syncClients: true,
  syncInvoices: true,
  pix: true,
  dispatch: true,
  preflight: 'credential',
  ressalva:
    'Entrega PIX e linha digitavel, mas NAO entrega link do boleto em PDF. A sincronizacao de clientes e sempre carga completa: a API nao tem filtro por data de alteracao.',
  credenciais: [
    {
      campo: 'rest_key',
      destino: 'config',
      obrigatorio: true,
      descricao:
        'Chave REST da Gama ISP. Vai no header Authorization da autenticacao, precedida da palavra "Basic" — e a chave CRUA, nao um Basic HTTP de verdade.',
    },
    {
      campo: 'login',
      destino: 'config',
      obrigatorio: true,
      descricao: 'Usuario da integracao, enviado no formulario de /api/v1/auth.',
    },
    {
      campo: 'password',
      destino: 'config',
      obrigatorio: true,
      descricao: 'Senha da integracao, enviada no formulario de /api/v1/auth.',
    },
  ],
};

/**
 * Margem de seguranca aplicada ao TTL do token de sessao, para renovar antes de
 * o ERP expira-lo e evitar 401 no meio de um disparo. Mesmo valor do MK
 * (`MK_TOKEN_TTL_MARGIN_SECONDS`).
 */
const GAMA_ISP_TOKEN_TTL_MARGIN_SECONDS = 300;

/**
 * Fallback de TTL quando o `expires` do JWT nao puder ser lido. O token da Gama
 * ISP dura 3 horas (observado em sondagem real), entao o fallback e 3h menos a
 * margem — nunca mais que a vida real do token.
 */
const GAMA_ISP_TOKEN_FALLBACK_TTL_SECONDS =
  3 * 60 * 60 - GAMA_ISP_TOKEN_TTL_MARGIN_SECONDS;

/** Timeout padrao por chamada; sobrescrevivel por empresa via `config.timeoutMs`. */
const GAMA_ISP_DEFAULT_TIMEOUT_MS = 90_000;

/**
 * Teto padrao de chamadas SIMULTANEAS por empresa, sobrescrevivel via
 * `config.invoicesConcurrency` (chave ja prevista em `companies/config.contract.ts`).
 *
 * O MK usa 6. Aqui e 3, e a diferenca e deliberada: a Gama ISP e documentadamente
 * fragil — uma unica pagina de 200 registros ja estoura a memoria do PHP dela
 * (ver `readJson`). E o disparo chama este service uma vez POR CLIENTE, todas em
 * paralelo (`template-dispatch-payload.service.ts`, `Promise.allSettled` sobre a
 * lista de clientes), entao sem teto uma campanha de 300 linhas viraria 300 GETs
 * simultaneos no servidor do cliente. Preferimos um disparo mais lento a um ERP
 * derrubado no meio da cobranca.
 */
const GAMA_ISP_DEFAULT_CONCURRENCY = 3;

/**
 * Registros por pagina nas listagens.
 *
 * O teto medido e ~116: `limit=116` responde, `limit=200` estoura a memoria do
 * PHP do ERP — e estoura do jeito pior possivel, com HTTP 200 e corpo HTML (ver
 * `readJson`). Usamos 100 para nao operar rente ao limite: o custo e ~40 paginas
 * de clientes em vez de 34, e a diferenca some perto do risco de derrubar o ERP.
 */
const GAMA_ISP_PAGE_SIZE = 100;

/**
 * Teto de paginas por varredura, para nunca cair em laco infinito caso a API
 * passe a ignorar `offset` (ela ja ignora todo o resto). 5.000 paginas cobrem com
 * folga as ~1.553 da carga completa de faturas.
 */
const GAMA_ISP_MAX_PAGES = 5_000;

/** TTL do cache Redis do snapshot de faturas em lote (mesmo padrao do SGP/IXC/MK). */
const GAMA_ISP_INVOICE_BATCH_CACHE_TTL = 5 * 60;

/** `tipo_id` do array `contato` de um cliente. */
const GAMA_ISP_CONTATO_WHATSAPP = 2;
const GAMA_ISP_CONTATO_CELULAR = 1;
const GAMA_ISP_CONTATO_EMAIL = 3;

/** Minimo de digitos para um telefone ser aceito (DDD + numero). */
const GAMA_ISP_MIN_DIGITOS_TELEFONE = 10;

interface GamaIspConfig {
  rest_key: string;
  login: string;
  password: string;
}

/** Estado do semaforo de uma empresa. `fila` guarda quem espera vaga, em ordem. */
interface GamaIspPortao {
  limite: number;
  emUso: number;
  fila: (() => void)[];
}

@Injectable()
export class GamaIspInvoicesService {
  private readonly logger = new Logger('[GAMAISP] GamaIspInvoicesService');

  /**
   * Portao de concorrencia POR EMPRESA. O service e singleton do Nest, entao
   * este mapa vale para todos os caminhos de chamada (disparo, relatory-resolver
   * e o que vier depois) sem precisar tocar no laco que e compartilhado com os
   * outros ERPs.
   *
   * A chave e o companyId de proposito: duas empresas Gama diferentes falam com
   * servidores diferentes e nao tem por que competir pela mesma vaga.
   *
   * Cresce no maximo ate o numero de empresas Gama cadastradas.
   */
  private readonly portoes = new Map<string, GamaIspPortao>();

  /**
   * Autenticacao EM VOO por empresa (single-flight).
   *
   * Sem isto, N chamadas concorrentes com cache frio abrem N `POST /auth`. E o
   * cache fica frio com mais frequencia do que parece: quando o Redis esta fora,
   * `RedisService.get` devolve `null` em silencio e TODA chamada passaria a
   * autenticar de novo.
   */
  private readonly autenticacoesEmVoo = new Map<string, Promise<string>>();

  constructor(private readonly redisService: RedisService) {}

  /** O `config` ja apareceu como string JSON no banco — normaliza os dois casos. */
  private configObject(company: Company): Record<string, any> {
    const config = company?.config;
    if (!config) return {};
    if (typeof config === 'string') {
      try {
        return JSON.parse(config);
      } catch {
        return {};
      }
    }
    return config;
  }

  private parseConfig(company: Company): GamaIspConfig {
    const config = this.configObject(company);

    const rest_key = config.rest_key;
    const login = config.login;
    const password = config.password;

    if (!rest_key || !login || !password) {
      throw new BadRequestException(
        '[GAMAISP] Credenciais da Gama ISP nao configuradas (rest_key/login/password)',
      );
    }
    if (!company?.url) {
      throw new BadRequestException('[GAMAISP] URL da Gama ISP nao configurada');
    }

    return { rest_key, login, password };
  }

  private tokenCacheKey(company: Company): string {
    return `gamaisp:session-token:${company.id}`;
  }

  /**
   * `fetch` com timeout. Falha de rede vira BadRequestException com o HOST (e
   * nunca a URL completa): a rota de faturas carrega o CPF/CNPJ do cliente no
   * caminho, e ele nao tem por que ir parar no log.
   */
  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    company: Company,
    label: string,
  ): Promise<Response> {
    const timeoutMs = Number(
      this.configObject(company)?.timeoutMs ?? GAMA_ISP_DEFAULT_TIMEOUT_MS,
    );

    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err: any) {
      throw new BadRequestException(
        `[GAMAISP] ${label}: falha de rede ao acessar ${company.url} -> ${String(err?.message ?? err)}`,
      );
    }
  }

  /**
   * ARMADILHA CENTRAL DESTA API: ERRO CHEGA COM HTTP 200.
   *
   * Quando a resposta e grande demais, a Gama ISP responde HTTP 200 com um corpo
   * HTML de fatal error do PHP (`<pre><b>Fatal error</b>: Allowed memory size of
   * 268435456 bytes exhausted ...`). `response.ok` nao significa nada aqui.
   *
   * Por isso a validacao e sempre em tres etapas, nesta ordem:
   *   1. HTTP status (pega os erros honestos),
   *   2. o corpo E JSON? (pega o fatal error do PHP),
   *   3. o envelope diz `status: "success"`?
   *
   * Qualquer atalho aqui faz o disparo seguir com uma lista vazia achando que o
   * cliente nao tem fatura em aberto.
   */
  private async readJson<T>(
    response: Response,
    label: string,
  ): Promise<T> {
    const raw = await response.text();

    if (!response.ok) {
      throw new BadRequestException(
        `[GAMAISP] ${label}: HTTP ${response.status} -> ${this.resumeCorpo(raw)}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException(
        `[GAMAISP] ${label}: resposta HTTP ${response.status} nao e JSON (provavel fatal error do PHP) -> ${this.resumeCorpo(raw)}`,
      );
    }

    const envelope = parsed as GamaIspResponse<unknown>;
    if (String(envelope?.status ?? '').toLowerCase() !== 'success') {
      throw new BadRequestException(
        `[GAMAISP] ${label}: a API nao retornou status "success" -> ${this.resumeCorpo(raw)}`,
      );
    }

    return parsed as T;
  }

  /** Corpo de erro resumido e sem markup, para caber numa mensagem legivel. */
  private resumeCorpo(texto: string): string {
    return String(texto ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
  }

  /**
   * `POST /api/v1/auth` — devolve o JWT (3h de validade).
   *
   * Dois detalhes que sao a diferenca entre funcionar e nao funcionar:
   *  - o corpo e `multipart/form-data` com `login` e `password` (nao e JSON);
   *  - o header e `Authorization: Basic <rest_key>` com a chave CRUA. NAO e
   *    Basic HTTP: nao existe base64 de "usuario:senha" aqui. Mandar o rest_key
   *    como Bearer nas rotas de negocio devolve 401, e o JWT cru (sem "Bearer")
   *    devolve 403.
   *
   * O Content-Type NAO e definido a mao de proposito: o `fetch` monta o boundary
   * do multipart sozinho a partir do FormData.
   */
  private async authenticate(company: Company): Promise<string> {
    const { rest_key, login, password } = this.parseConfig(company);

    const form = new FormData();
    form.append('login', login);
    form.append('password', password);

    const response = await this.fetchWithTimeout(
      `https://${company.url}/api/v1/auth`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${rest_key}`,
          Accept: 'application/json',
        },
        body: form,
      },
      company,
      'autenticacao',
    );

    const data = await this.readJson<GamaIspAuthResponse>(
      response,
      'autenticacao',
    );

    const token = typeof data?.data === 'string' ? data.data.trim() : '';
    if (!token) {
      throw new BadRequestException(
        '[GAMAISP] autenticacao: a API retornou sucesso sem token em `data`',
      );
    }

    return token;
  }

  /**
   * Le o payload do JWT. Retorna `null` em qualquer formato inesperado — o
   * chamador cai no TTL de fallback. O `catch` silencioso e deliberado: um JWT
   * ilegivel nao e erro de negocio, so nos impede de derivar o TTL exato.
   */
  private decodeJwtPayload(jwt: string): GamaIspJwtPayload | null {
    const segments = String(jwt ?? '').split('.');
    if (segments.length < 2) return null;

    try {
      const parsed = JSON.parse(
        Buffer.from(segments[1], 'base64url').toString('utf8'),
      );
      return parsed && typeof parsed === 'object'
        ? (parsed as GamaIspJwtPayload)
        : null;
    } catch {
      return null;
    }
  }

  /**
   * TTL em segundos derivado do `expires` (unix seconds) do JWT, ja descontada a
   * margem de seguranca. `null` quando nao da para derivar ou quando o token ja
   * esta perto demais de expirar — nesses casos o chamador usa o fallback.
   */
  private computeTokenTtlSeconds(jwt: string): number | null {
    const expires = Number(this.decodeJwtPayload(jwt)?.expires);
    if (!Number.isFinite(expires) || expires <= 0) return null;

    const ttl =
      Math.floor(expires - Date.now() / 1000) -
      GAMA_ISP_TOKEN_TTL_MARGIN_SECONDS;
    return ttl > 0 ? ttl : null;
  }

  /**
   * Token de sessao da Gama ISP, cacheado no Redis por empresa. Sequencia: le do
   * Redis -> se ausente, autentica, deriva o TTL do proprio JWT e cacheia. Mesmo
   * desenho do MK (`mk:session-token:<id>`).
   */
  private async getSessionToken(company: Company): Promise<string> {
    const cacheKey = this.tokenCacheKey(company);
    const cached = await this.redisService.get<string>(cacheKey);
    if (cached) return cached;

    const chave = String(company?.id ?? '');

    // SINGLE-FLIGHT: havendo uma autenticacao em voo para esta empresa, os demais
    // chamadores esperam a MESMA promise em vez de abrir a sua. Com cache frio e
    // chamadas concorrentes, e a diferenca entre N `POST /auth` e um.
    const emVoo = this.autenticacoesEmVoo.get(chave);
    if (emVoo) return emVoo;

    const promessa = this.autenticarECachear(company, cacheKey).finally(() => {
      this.autenticacoesEmVoo.delete(chave);
    });

    this.autenticacoesEmVoo.set(chave, promessa);
    return promessa;
  }

  /** Autentica e grava no Redis. Sempre chamado atraves do single-flight acima. */
  private async autenticarECachear(
    company: Company,
    cacheKey: string,
  ): Promise<string> {
    const token = await this.authenticate(company);
    const ttlSeconds =
      this.computeTokenTtlSeconds(token) ?? GAMA_ISP_TOKEN_FALLBACK_TTL_SECONDS;

    await this.redisService.set(cacheKey, token, ttlSeconds);
    this.logger.log(
      `Token de sessao renovado para company=${company.id} (TTL=${ttlSeconds}s)`,
    );

    return token;
  }

  private async invalidateSessionToken(company: Company): Promise<void> {
    await this.redisService.del(this.tokenCacheKey(company));
  }

  /** Teto de simultaneidade da empresa: `config.invoicesConcurrency` ou o default. */
  private limiteDeConcorrencia(company: Company): number {
    const bruto = Number(
      this.configObject(company)?.invoicesConcurrency ??
        GAMA_ISP_DEFAULT_CONCURRENCY,
    );
    return Number.isFinite(bruto) && bruto >= 1
      ? Math.floor(bruto)
      : GAMA_ISP_DEFAULT_CONCURRENCY;
  }

  /**
   * Reserva uma vaga para falar com a Gama ISP desta empresa e devolve a funcao
   * que a libera. Sem vaga, a chamada ESPERA na fila (FIFO) ate alguem liberar —
   * quem chama nao precisa saber disso, so ve um `await` mais longo.
   *
   * POR QUE NAO E O `runWithConcurrency` DO MK: aquele recebe um array pronto e
   * distribui N workers sobre ele. Aqui nao existe array — as chamadas chegam
   * INDEPENDENTES, uma por cliente, vindas de um laco compartilhado com os outros
   * ERPs que nao podemos alterar. O que cabe e um semaforo: cada chamada pede a
   * sua vaga e devolve no fim.
   *
   * Na liberacao a vaga e ENTREGUE direto ao proximo da fila, sem passar por
   * `emUso--`. Decrementar e deixar o proximo incrementar abriria uma janela em
   * que uma terceira chamada furaria o teto.
   */
  private async acquireSlot(company: Company): Promise<() => void> {
    const chave = String(company?.id ?? '');
    const limite = this.limiteDeConcorrencia(company);

    let portao = this.portoes.get(chave);
    if (!portao) {
      portao = { limite, emUso: 0, fila: [] };
      this.portoes.set(chave, portao);
    } else {
      // Rele o limite a cada chamada: mudar `invoicesConcurrency` no cadastro
      // passa a valer sem reiniciar o processo.
      portao.limite = limite;
    }

    const meuPortao = portao;

    if (meuPortao.emUso < meuPortao.limite) {
      meuPortao.emUso++;
    } else {
      await new Promise<void>((resolve) => meuPortao.fila.push(resolve));
      // Fomos acordados por um `liberar()`, que ja nos passou a vaga dele —
      // por isso NAO incrementamos aqui.
    }

    let jaLiberou = false;
    return () => {
      // Idempotente: liberar duas vezes devolveria uma vaga que nao existe e
      // furaria o teto de forma permanente.
      if (jaLiberou) return;
      jaLiberou = true;

      const proximo = meuPortao.fila.shift();
      if (proximo) proximo();
      else meuPortao.emUso--;
    };
  }

  /**
   * Executa `tarefa` ocupando UMA vaga do semaforo da empresa.
   *
   * O `finally` e obrigatorio, nao estilo: se a vaga so voltasse no caminho
   * feliz, cada erro do ERP (e aqui erro chega ate com HTTP 200) vazaria uma
   * permissao, e depois de N erros o service travaria de vez para a empresa.
   */
  private async comVaga<T>(
    company: Company,
    tarefa: () => Promise<T>,
  ): Promise<T> {
    const liberarVaga = await this.acquireSlot(company);
    try {
      return await tarefa();
    } finally {
      liberarVaga();
    }
  }

  /**
   * Chamada autenticada ao ERP, com renovacao unica do token em 401/403.
   *
   * NAO PEDE VAGA no semaforo, de proposito: quem chama ja precisa estar dentro
   * de uma (`comVaga`). Aninhar vagas travaria o service para sempre numa empresa
   * com `invoicesConcurrency: 1` — a chamada interna esperaria a vaga que a
   * externa so devolve quando a interna terminar.
   */
  private async requisitarComToken<T>(
    company: Company,
    url: string,
    method: 'GET' | 'POST',
    label: string,
  ): Promise<T> {
    let authRetried = false;

    // 401 = credencial recusada, 403 = token invalido para a rota; nos dois casos
    // o token cacheado pode simplesmente ter expirado antes da margem.
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const token = await this.getSessionToken(company);

      const response = await this.fetchWithTimeout(
        url,
        {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        },
        company,
        label,
      );

      if ((response.status === 401 || response.status === 403) && !authRetried) {
        authRetried = true;
        await this.invalidateSessionToken(company);
        this.logger.warn(
          `Token de sessao invalido (${response.status}) em ${label} para company=${company.id}; renovando e tentando novamente`,
        );
        continue;
      }

      return this.readJson<T>(response, label);
    }

    throw new BadRequestException(
      `[GAMAISP] ${label}: falha de autenticacao apos renovar o token de sessao`,
    );
  }

  /**
   * Uma pagina de uma listagem (`/clientes` ou `/faturas`).
   *
   * Os parametros vao na QUERY STRING. Nenhum filtro funciona nesta API — so
   * `limit`, `offset`, `order` e `direction` — e e `order`+`direction` que
   * viabilizam a sincronizacao por janela.
   *
   * Cada pagina ocupa UMA vaga do semaforo: a varredura e o caminho de maior
   * volume do sistema, e ela divide o mesmo teto com o disparo, entao uma sync em
   * andamento nunca soma requisicoes as de uma campanha rodando ao mesmo tempo.
   */
  private async listarPagina<T>(
    company: Company,
    recurso: 'clientes' | 'faturas',
    params: {
      offset: number;
      limit: number;
      order: string;
      direction: 'asc' | 'desc';
    },
    label: string,
  ): Promise<{ itens: T[]; total: number | null }> {
    const qs = new URLSearchParams({
      limit: String(params.limit),
      offset: String(params.offset),
      order: params.order,
      direction: params.direction,
    });

    const payload = await this.comVaga(company, () =>
      this.requisitarComToken<GamaIspResponse<T[]>>(
        company,
        `https://${company.url}/api/v1/${recurso}?${qs.toString()}`,
        'POST',
        label,
      ),
    );

    const total = Number(payload?.total);

    return {
      itens: Array.isArray(payload?.data) ? payload.data : [],
      total: Number.isFinite(total) ? total : null,
    };
  }

  /** "S"/"N" da Gama ISP — qualquer coisa que nao seja "S" conta como nao. */
  private isFlagOn(value: unknown): boolean {
    return String(value ?? '')
      .trim()
      .toUpperCase() === 'S';
  }

  /**
   * A rota por documento devolve TODAS as faturas do cliente, PAGAS INCLUSIVE
   * (num caso real: 84 faturas, 4 em aberto e 80 pagas). O filtro de "em aberto"
   * e nosso:
   *  - `data_pagamento` preenchida = paga;
   *  - `excluida` / `desativada` = "S" = fatura que nao deve ser cobrada.
   */
  private isOpen(fatura: GamaIspFatura): boolean {
    if (this.isFlagOn(fatura?.excluida)) return false;
    if (this.isFlagOn(fatura?.desativada)) return false;
    return !String(fatura?.data_pagamento ?? '').trim();
  }

  /** Data de hoje em America/Sao_Paulo no formato ISO (o container roda em UTC). */
  private todayIso(): string {
    return DateTime.now().setZone('America/Sao_Paulo').toISODate() ?? '';
  }

  /**
   * Vencida = venceu ANTES de hoje. Comparacao direta de strings ISO
   * `YYYY-MM-DD`, que ordenam lexicograficamente na mesma ordem cronologica.
   */
  private isOverdue(dueDate: string | null | undefined, todayIso: string): boolean {
    const due = String(dueDate ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || !todayIso) return false;
    return due < todayIso;
  }

  /**
   * Disparo por cliente: busca as faturas do CPF/CNPJ, descarta as pagas e as
   * canceladas, e mapeia para o DTO de disparo.
   *
   * O documento e normalizado com `replace(/\D/g, '')` como no SGP. A rota
   * aceita com e sem mascara (respostas identicas), mas normalizar mantem uma
   * unica forma no cache/log e evita mascara exotica vinda da base.
   *
   * CPF inexistente (ou lixo) NAO da erro: a API devolve HTTP 200 com
   * `data: []`. Ou seja, "documento errado" e "cliente sem fatura em aberto"
   * chegam iguais aqui — a lista volta vazia, sem excecao, e quem consome decide.
   */
  async getInvoices(cliente: Client): Promise<InvoicesResponseDto> {
    const company = cliente.company;

    // Valida a credencial ANTES de pedir vaga: erro de cadastro nao tem por que
    // ocupar uma das poucas permissoes de concorrencia da empresa.
    this.parseConfig(company);

    return this.comVaga(company, () =>
      this.buscarFaturasPorDocumento(cliente),
    );
  }

  /**
   * PIX de UMA fatura, por id, via `GET /api/v1/faturas/id/{id}`.
   *
   * A busca por documento ja traz `pix_qrcode` na maioria das faturas, e por
   * isso este endpoint ficou registrado como fallback nao usado. Producao
   * provou o caso previsto: fatura EM ABERTO, com valor e vencimento, e
   * `pix_qrcode` null na listagem por documento. Sem PIX o botao
   * ORDER_DETAILS nao monta e o destinatario e pulado inteiro — o que
   * aconteceu na POWERNET em 02/09/2026.
   *
   * Devolve `null` e NAO lanca quando o ERP nao responde ou nao tem o codigo:
   * quem chama ja sabe lidar com PIX ausente, e derrubar o lote por causa de
   * uma fatura seria pior do que pular um destinatario com motivo registrado.
   */
  async fetchPixByInvoice(
    company: Company,
    invoiceId: string,
  ): Promise<string | null> {
    const id = String(invoiceId ?? '').trim();
    if (!id) return null;

    try {
      // Valida a credencial ANTES de pedir vaga, como em `getInvoices`.
      this.parseConfig(company);

      const payload = await this.comVaga(company, () =>
        this.requisitarComToken<
          GamaIspResponse<GamaIspFatura | GamaIspFatura[]>
        >(
          company,
          `https://${company.url}/api/v1/faturas/id/${encodeURIComponent(id)}`,
          'GET',
          'fatura por id (PIX)',
        ),
      );

      // O envelope da Gama devolve `data` ora como objeto, ora como lista de um
      // item, dependendo da rota. Aceitar os dois custa uma linha e evita um
      // null silencioso se a rota mudar de forma.
      const dado = payload?.data;
      const fatura = Array.isArray(dado) ? dado[0] : dado;
      const pix = String(fatura?.pix_qrcode ?? '').trim();

      if (!pix) {
        this.logger.warn(
          `[GAMAISP] Fatura id=${id} (company=${company.id}) tambem veio sem ` +
            `pix_qrcode na consulta por id — o ERP nao tem o codigo para ela.`,
        );
        return null;
      }

      return pix;
    } catch (err) {
      this.logger.warn(
        `[GAMAISP] Falha ao buscar PIX da fatura id=${id} ` +
          `(company=${company.id}): ${(err as Error)?.message}`,
      );
      return null;
    }
  }

  /** Corpo do disparo. Sempre chamado por `getInvoices`, ja dentro do semaforo. */
  private async buscarFaturasPorDocumento(
    cliente: Client,
  ): Promise<InvoicesResponseDto> {
    const company = cliente.company;

    const documento = String(cliente?.cnpj_cpf ?? '').replace(/\D/g, '');
    if (!documento) {
      throw new BadRequestException(
        '[GAMAISP] Cliente sem CPF/CNPJ — a Gama ISP so consulta faturas por documento',
      );
    }

    const payload = await this.requisitarComToken<GamaIspFaturasResponse>(
      company,
      `https://${company.url}/api/v1/faturas/doc/${encodeURIComponent(documento)}`,
      'GET',
      'faturas por documento',
    );

    const faturas = Array.isArray(payload.data) ? payload.data : [];
    const hoje = this.todayIso();

    const abertas = faturas
      .filter((fatura) => this.isOpen(fatura))
      // Vencimento mais recente primeiro, como nos services vizinhos. A ordem e
      // decidida no ISO CRU (`YYYY-MM-DD`), que ordena lexicograficamente na
      // mesma ordem cronologica. NAO da para reaproveitar o `parseDate` dos
      // vizinhos: aquele faz `split('/')` porque la a data ja chega em
      // DD/MM/YYYY.
      .sort((a, b) =>
        String(b?.data_vencimento ?? '').localeCompare(
          String(a?.data_vencimento ?? ''),
        ),
      );

    const list: InvoiceMapResultDto[] = abertas.map(
      (fatura): InvoiceMapResultDto => ({
        invoice_id: String(fatura.id ?? ''),
        contract_id: String(fatura.cliente_contrato_id ?? ''),
        // `formatarDataBR` e o mesmo util do IXC e do SGP — os outros dois
        // adapters cujo ERP entrega data ISO. O campo alimenta a variavel
        // `data_vencimento_fatura` do template, que vai LITERALMENTE para a
        // mensagem do cliente: precisa sair "10/01/26", nao "2026-01-10". O
        // `overdue` e a ordenacao usam o ISO cru, antes da conversao.
        invoice_due_date: formatarDataBR(fatura.data_vencimento),
        invoice_amount: String(fatura.valor_total ?? ''),
        invoice_status: 'A Receber',
        overdue: this.isOverdue(fatura.data_vencimento, hoje),
        ticket_digitable_line: fatura.linha_digitavel ?? null,
        // PDF DO BOLETO FICA DE FORA DESTA ENTREGA (decisao do usuario).
        // O que existe: `GET /api/v1/faturas/id/{id}/pdf` devolve JSON com o
        // PDF em base64 (~250 KB por fatura) e `url_cobranca_gateway` veio null
        // em todas as amostras. Ou seja, nao ha URL publica para colocar aqui —
        // entregar o PDF exigiria hospeda-lo em algum lugar nosso, o que e
        // decisao de infraestrutura, nao de adapter. Ate la, `null`: o disparo
        // usa linha digitavel + PIX.
        ticket_pdf_link: null,
        code_pix: fatura.pix_qrcode ?? null,
      }),
    );

    return Object.assign(new InvoicesResponseDto(), {
      status: 'success',
      message: 'Dados consultados com sucesso',
      list,
    });
  }

  // ------------------------------------------------------ SINCRONIZACAO

  /**
   * Varre TODOS os clientes da empresa (`POST /api/v1/clientes`), paginando por
   * `offset` com `order=id&direction=asc`.
   *
   * O `since` e aceito para casar com a assinatura que o `ClientsSyncCron` usa
   * nos outros ERPs, mas e IGNORADO: a API nao tem filtro por data de alteracao
   * (nem por nada), entao toda rodada e carga completa. Sao ~40 paginas para os
   * 3.998 clientes da POWERNET — caro, mas uma vez por dia, no cron das 3h.
   *
   * NAO FILTRA POR `situacao`, e isso e decisao, nao esquecimento. Tres razoes:
   * (1) cliente "Desativado" ou "Bloqueado" e normalmente quem foi cortado por
   * falta de pagamento, ou seja, exatamente o alvo da cobranca; (2) o
   * `persistSnapshot` DESCARTA toda fatura cujo cliente nao exista na base local,
   * entao filtrar aqui apagaria as faturas dessas pessoas do snapshot; (3) e o
   * que os vizinhos que tambem nao conseguem filtrar no ERP (SGP e MK) fazem. A
   * distribuicao por situacao vai no log de cada rodada, para ninguem descobrir
   * tarde que a base mudou de perfil.
   */
  async fetchClients(
    company: Company,
    _since?: Date,
  ): Promise<GamaIspCliente[]> {
    this.parseConfig(company);

    const todos: GamaIspCliente[] = [];
    const idsVistos = new Set<string>();
    let total: number | null = null;

    for (let pagina = 0; pagina < GAMA_ISP_MAX_PAGES; pagina++) {
      const { itens, total: totalDaPagina } = await this.listarPagina<GamaIspCliente>(
        company,
        'clientes',
        {
          offset: pagina * GAMA_ISP_PAGE_SIZE,
          limit: GAMA_ISP_PAGE_SIZE,
          order: 'id',
          direction: 'asc',
        },
        'clientes (pagina)',
      );

      if (totalDaPagina != null) total = totalDaPagina;
      if (!itens.length) break;

      // Dedupe por id: se a API ignorar o `offset` em algum cenario, a varredura
      // repetiria a primeira pagina para sempre. Sem id novo, para.
      let novos = 0;
      for (const cliente of itens) {
        const id = String(cliente?.id ?? '');
        if (!id || idsVistos.has(id)) continue;
        idsVistos.add(id);
        todos.push(cliente);
        novos++;
      }

      if (!novos) break;
      if (itens.length < GAMA_ISP_PAGE_SIZE) break;
    }

    this.logger.log(
      `[Clientes] company=${company.id} ${todos.length} cliente(s) lido(s)` +
        (total != null ? ` de ${total} informado(s) pela API` : '') +
        ` — situacao: ${this.resumirSituacoes(todos)}`,
    );

    return todos;
  }

  /** Contagem por `situacao`, para o log da sincronizacao. */
  private resumirSituacoes(clientes: GamaIspCliente[]): string {
    const contagem = new Map<string, number>();
    for (const cliente of clientes) {
      const situacao = String(cliente?.situacao ?? 'sem situacao').trim();
      contagem.set(situacao, (contagem.get(situacao) ?? 0) + 1);
    }
    return (
      [...contagem.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([situacao, qtd]) => `${situacao}=${qtd}`)
        .join(' ') || 'nenhuma'
    );
  }

  /**
   * Telefone do cliente, so com digitos.
   *
   * Ordem de preferencia: WhatsApp (tipo_id 2) e depois Celular (tipo_id 1).
   * Telefone Fixo (tipo_id 5) NAO entra: nao recebe mensagem. Sem nenhum dos
   * dois, devolve string vazia — ver `toClientUpsert`.
   */
  private escolherTelefone(contatos?: GamaIspContato[] | null): string {
    const lista = Array.isArray(contatos) ? contatos : [];

    const doTipo = (tipoId: number) =>
      lista.find((contato) => {
        if (Number(contato?.tipo_id) !== tipoId) return false;
        const digitos = String(contato?.valor ?? '').replace(/\D/g, '');
        return digitos.length >= GAMA_ISP_MIN_DIGITOS_TELEFONE;
      });

    const escolhido =
      doTipo(GAMA_ISP_CONTATO_WHATSAPP) ?? doTipo(GAMA_ISP_CONTATO_CELULAR);

    return String(escolhido?.valor ?? '').replace(/\D/g, '');
  }

  /** Email do cliente: `tipo_id` 3, ou qualquer contato cujo tipo mencione email. */
  private escolherEmail(contatos?: GamaIspContato[] | null): string {
    const lista = Array.isArray(contatos) ? contatos : [];

    const escolhido =
      lista.find(
        (contato) => Number(contato?.tipo_id) === GAMA_ISP_CONTATO_EMAIL,
      ) ??
      lista.find((contato) => /mail/i.test(String(contato?.tipo ?? '')));

    const valor = String(escolhido?.valor ?? '').trim();
    return valor.includes('@') ? valor : '';
  }

  /**
   * Mapeia um cliente da Gama ISP para o upsert do `Client` local. Retorna
   * `null` quando falta CPF/CNPJ — sem documento nao ha como casar o cliente com
   * as faturas nem com a chave unica (cnpj_cpf, companyId).
   *
   * DIFERENCA DELIBERADA EM RELACAO A IXC/SGP/MK: cliente SEM TELEFONE nao e
   * descartado, entra com `whatsapp` vazio. Ele nao podera ser disparado (o
   * `buildQueueRecipients` pula destinatario sem numero), mas EXISTE na base — e
   * e isso que impede o `persistSnapshot` de jogar fora as faturas dele, que
   * continuam valendo para dashboard, clientes vencidos e conciliacao. A coluna
   * `whatsapp` e NOT NULL, dai a string vazia em vez de null.
   */
  toClientUpsert(
    record: GamaIspCliente,
    company: Company,
  ): QueryDeepPartialEntity<Client> | null {
    const cnpj_cpf = String(record?.cpf_cnpj ?? '').replace(/\D/g, '');
    if (!cnpj_cpf) return null;

    const whatsapp = this.escolherTelefone(record?.contato);
    const email = this.escolherEmail(record?.contato);

    // `cobranca` e `endereco` tem as mesmas chaves; o de cobranca e o relevante
    // aqui, como o MK faz ao preferir o endereco marcado como COBRANCA.
    const endereco: GamaIspEndereco =
      (record?.cobranca?.logradouro ? record.cobranca : record?.endereco) ?? {};

    return {
      cnpj_cpf,
      name: String(record?.nome ?? '').trim(),
      clientId: String(record.id),
      whatsapp,
      ...(email && { email }),
      ...(endereco.logradouro && { street: endereco.logradouro }),
      ...(endereco.numero != null &&
        String(endereco.numero).trim() !== '' && {
          numberHouse: String(endereco.numero),
        }),
      ...(endereco.cidade && { city: endereco.cidade }),
      ...(endereco.cep && {
        zipCode: String(endereco.cep).replace(/\D/g, '').slice(0, 9),
      }),
      companyId: company.id,
    };
  }

  /**
   * Faturas em aberto de uma janela de vencimento, indexadas por
   * `cliente_id` (= `Client.clientId`) — o mesmo contrato do IXC e do MK, que o
   * `persistSnapshot` resolve pelo `byClientId`.
   *
   * A VARREDURA PARA CEDO, e e disso que a sincronizacao depende para ser
   * viavel: com `order=data_vencimento&direction=desc` as faturas vem da mais
   * recente para a mais antiga, entao a primeira que cai ANTES de `startDate`
   * garante que todas as seguintes tambem caem — nao ha por que continuar
   * paginando as 180 mil. Sem isso, uma sincronizacao seriam ~1.553 requisicoes
   * contra um ERP que morre com pagina de 200 registros.
   *
   * Cacheia no Redis (TTL 5min) como SGP/IXC/MK.
   *
   * @param startDate inicio da janela de vencimento, ISO `YYYY-MM-DD`
   * @param endDate   fim da janela de vencimento, ISO `YYYY-MM-DD`
   */
  async getInvoicesByDateWindowBatch(
    company: Company,
    startDate: string,
    endDate: string,
  ): Promise<Map<string, GamaIspFatura[]>> {
    this.parseConfig(company);

    const cacheKey = `gamaisp:invoice-batch:${company.id}:${startDate}:${endDate}`;
    const cached =
      await this.redisService.get<[string, GamaIspFatura[]][]>(cacheKey);
    if (cached) return new Map(cached);

    const porCliente = new Map<string, GamaIspFatura[]>();
    const idsVistos = new Set<string>();

    let lidas = 0;
    let posterioresAJanela = 0;
    let fechadas = 0;
    let paginas = 0;
    let pareiPorJanela = false;

    for (let pagina = 0; pagina < GAMA_ISP_MAX_PAGES; pagina++) {
      const { itens } = await this.listarPagina<GamaIspFatura>(
        company,
        'faturas',
        {
          offset: pagina * GAMA_ISP_PAGE_SIZE,
          limit: GAMA_ISP_PAGE_SIZE,
          order: 'data_vencimento',
          direction: 'desc',
        },
        'faturas (pagina)',
      );

      if (!itens.length) break;
      paginas++;
      lidas += itens.length;

      let novas = 0;

      for (const fatura of itens) {
        const id = String(fatura?.id ?? '');
        if (id && !idsVistos.has(id)) {
          idsVistos.add(id);
          novas++;
        }

        const vencimento = String(fatura?.data_vencimento ?? '').slice(0, 10);

        // Ordenacao decrescente: daqui para tras e tudo mais antigo que a janela.
        if (vencimento && vencimento < startDate) {
          pareiPorJanela = true;
          continue;
        }
        if (vencimento && vencimento > endDate) {
          posterioresAJanela++;
          continue;
        }
        if (!this.isOpen(fatura)) {
          fechadas++;
          continue;
        }

        const chave = String(fatura?.cliente_id ?? '');
        if (!chave) continue;

        const lista = porCliente.get(chave) ?? [];
        lista.push(fatura);
        porCliente.set(chave, lista);
      }

      if (pareiPorJanela) break;
      // Sem fatura nova, a API deixou de respeitar o `offset` — para em vez de
      // repetir a mesma pagina indefinidamente.
      if (!novas) break;
      if (itens.length < GAMA_ISP_PAGE_SIZE) break;
    }

    this.logger.log(
      `[InvoiceBatch] company=${company.id} janela=${startDate}..${endDate} ` +
        `paginas=${paginas} lidas=${lidas} emAberto=${idsVistos.size ? [...porCliente.values()].reduce((soma, l) => soma + l.length, 0) : 0} ` +
        `fechadas=${fechadas} posterioresAJanela=${posterioresAJanela} ` +
        `parouPorJanela=${pareiPorJanela}`,
    );

    await this.redisService.set(
      cacheKey,
      [...porCliente.entries()],
      GAMA_ISP_INVOICE_BATCH_CACHE_TTL,
    );

    return porCliente;
  }

  /**
   * Mapeia uma fatura da Gama ISP para o upsert do snapshot. Retorna `null` sem
   * vencimento — sem ele a fatura nao serve a regua de cobranca.
   *
   * `expiration` fica no ISO `YYYY-MM-DD` que o ERP entrega: e um dos dois
   * formatos que o projeto ja le em todo lugar (`toBrDate`,
   * `normalizeInvoiceDueDateToIso` e o CASE do `closeMissingOpenInvoices`
   * tratam `DD/MM/YYYY` e `YYYY-MM-DD`).
   *
   * Ao contrario do MK, o `pixCode` E gravado: aqui ele vem no mesmo payload da
   * fatura, entao guardar nao custa nenhuma requisicao a mais — e e o que faz o
   * `POST /invoices/pix/batch` responder pelo snapshot local.
   */
  toInvoiceUpsert(
    fatura: GamaIspFatura,
    context: { clientId: string; companyId: string; syncTime: Date },
  ): QueryDeepPartialEntity<Invoice> | null {
    const expiration = String(fatura?.data_vencimento ?? '').slice(0, 10);
    if (!expiration) return null;

    return {
      id_fatura: String(fatura.id),
      contractId:
        fatura.cliente_contrato_id != null
          ? String(fatura.cliente_contrato_id)
          : undefined,
      value: String(fatura.valor_total ?? '0'),
      status: 'A Receber',
      expiration,
      ticketDigitableLine: fatura.linha_digitavel ?? null,
      // Sempre null: a Gama ISP so entrega o boleto como base64, sem URL
      // publica. Ver o comentario em `buscarFaturasPorDocumento`.
      ticketPdfLink: null,
      pixCode: fatura.pix_qrcode ?? null,
      lastSyncAt: context.syncTime,
      clientId: context.clientId,
      companyId: context.companyId,
    };
  }
}
