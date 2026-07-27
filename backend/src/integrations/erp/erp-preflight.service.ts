import { Injectable, Logger } from '@nestjs/common';
import { getErpDefinition } from './erp.registry';

/**
 * Timeout por chamada. Generoso o suficiente para ERP lento, curto o suficiente
 * para o cadastro nao ficar pendurado — o preflight roda no caminho sincrono do
 * `POST /companies`.
 */
const PREFLIGHT_TIMEOUT_MS = 15_000;

/**
 * Dados minimos para testar uma credencial. Deliberadamente NAO e `Company`: o
 * preflight roda ANTES de persistir, entao nao pode depender de `id` nem de
 * qualquer campo gerado pelo banco.
 */
export interface PreflightInput {
  readonly erp: string;
  readonly url: string;
  readonly autorization?: string | null;
  readonly config?: Record<string, any> | null;
}

export type PreflightStatus =
  /** Credencial validada contra o ERP. */
  | 'ok'
  /** ERP sem integracao implementada — nao ha o que testar. */
  | 'sem_integracao'
  /** O ERP recusou a credencial, ou nao foi possivel alcanca-lo. */
  | 'falhou';

export interface PreflightResult {
  readonly status: PreflightStatus;

  /**
   * Registros visiveis no ERP com a credencial informada. `null` quando o ERP
   * nao expoe contagem barata (MK e Hubsoft) — nunca chute um numero aqui, e a
   * diferenca entre "sei que tem 3.045" e "nao sei".
   */
  readonly clientesVisiveis: number | null;
  readonly faturasVisiveis: number | null;

  /** Motivo legivel da falha, para gravar na empresa e mostrar ao operador. */
  readonly erro: string | null;
}

@Injectable()
export class ErpPreflightService {
  private readonly logger = new Logger(ErpPreflightService.name);

  /**
   * Testa a credencial de um ERP com o menor numero de chamadas possivel.
   *
   * NUNCA lanca: qualquer falha vira `status: 'falhou'` com o motivo em `erro`.
   * O chamador (cadastro de empresa) precisa poder gravar a empresa inativa com
   * a explicacao, e nao abortar a requisicao inteira.
   *
   * Tambem nunca escreve nada — sem banco, sem Redis, sem cache. Isso importa
   * porque o cache de token do MK e indexado por `company.id`, que nao existe
   * antes do cadastro; por isso a autenticacao do MK e refeita aqui em vez de
   * reaproveitar `MkInvoicesService`.
   */
  async run(input: PreflightInput): Promise<PreflightResult> {
    const definicao = getErpDefinition(input.erp);

    if (!definicao) {
      return this.falha(`ERP nao reconhecido: "${input.erp}".`);
    }

    if (definicao.preflight === 'none') {
      return {
        status: 'sem_integracao',
        clientesVisiveis: null,
        faturasVisiveis: null,
        erro: null,
      };
    }

    const faltando = definicao.credenciais
      .filter((c) => c.obrigatorio && !this.leCampo(input, c.campo, c.destino))
      .map((c) => c.campo);

    if (faltando.length) {
      return this.falha(
        `Credencial incompleta para ${definicao.label}: faltam ${faltando.join(', ')}.`,
      );
    }

    if (!String(input.url ?? '').trim()) {
      return this.falha('URL do ERP nao informada.');
    }

    try {
      switch (definicao.code) {
        case 'IXC':
          return await this.preflightIxc(input);
        case 'SGP':
          return await this.preflightSgp(input);
        case 'MK':
          return await this.preflightMk(input);
        case 'HUBSOFT':
          return await this.preflightHubsoft(input);
        default:
          // ERP declarado no registro mas sem preflight implementado aqui.
          // Nao mente dizendo que esta ok — declara que nao sabe.
          return {
            status: 'sem_integracao',
            clientesVisiveis: null,
            faturasVisiveis: null,
            erro: null,
          };
      }
    } catch (err: any) {
      const motivo = this.motivoLegivel(err);
      // Sem credencial no log — apenas ERP, host e motivo.
      this.logger.warn(
        `[Preflight] ${definicao.label} ${input.url} falhou: ${motivo}`,
      );
      return this.falha(motivo);
    }
  }

  // ---------------------------------------------------------------- IXC

  /**
   * `POST /webservice/v1/cliente` com `rp: '1'` — devolve o total em `data.total`
   * sem trazer registro nenhum. Uma segunda chamada em `fn_areceber` da a
   * contagem de faturas.
   *
   * Cuidado especifico do IXC: ele responde HTTP 200 com `{ type: 'error' }` em
   * varios casos de credencial invalida, entao `response.ok` sozinho nao valida
   * nada.
   */
  private async preflightIxc(input: PreflightInput): Promise<PreflightResult> {
    const headers = {
      Authorization: `Basic ${Buffer.from(String(input.autorization)).toString('base64')}`,
      'Content-Type': 'application/json',
      ixcsoft: 'listar',
    };
    const base = `https://${input.url}/webservice/v1`;

    const clientes = await this.postJson(`${base}/cliente`, headers, {
      qtype: 'cliente.ativo',
      query: 'S',
      oper: '=',
      page: '1',
      rp: '1',
      sortname: 'cliente.id',
      sortorder: 'asc',
    });

    if (String(clientes?.type ?? '').toLowerCase() === 'error') {
      return this.falha(
        `IXC recusou a credencial: ${clientes?.message ?? 'sem detalhe'}`,
      );
    }

    const faturas = await this.postJson(`${base}/fn_areceber`, headers, {
      qtype: 'fn_areceber.id',
      query: '0',
      oper: '>',
      page: '1',
      rp: '1',
      sortname: 'fn_areceber.data_vencimento',
      sortorder: 'asc',
      grid_param: JSON.stringify([
        { TB: 'fn_areceber.liberado', OP: '=', P: 'S' },
        { TB: 'fn_areceber.status', OP: 'L', P: 'A' },
      ]),
    });

    return {
      status: 'ok',
      clientesVisiveis: this.numeroOuNull(clientes?.total),
      faturasVisiveis: this.numeroOuNull(faturas?.total),
      erro: null,
    };
  }

  // ---------------------------------------------------------------- SGP

  /**
   * `POST /api/ura/clientes` com `limit: 1` e `omitir_titulos: 'sim'` — o
   * parametro que torna a chamada barata. O total vem em `paginacao.total`, que
   * o SGP as vezes envelopa num array; ambos os shapes sao tratados.
   */
  private async preflightSgp(input: PreflightInput): Promise<PreflightResult> {
    const cfg = this.configObjeto(input);
    const headers = {
      Authorization: `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')}`,
      'Content-Type': 'application/json',
    };

    const data = await this.postJson(
      `https://${input.url}/api/ura/clientes`,
      headers,
      { offset: 0, limit: 1, omitir_titulos: 'sim' },
    );

    const paginacao = data?.[0]?.paginacao ?? data?.paginacao;

    return {
      status: 'ok',
      clientesVisiveis: this.numeroOuNull(paginacao?.total),
      // Faturas exigiriam uma janela de datas obrigatoria e uma segunda
      // chamada; nao vale o custo no cadastro.
      faturasVisiveis: null,
      erro: null,
    };
  }

  // ----------------------------------------------------------------- MK

  /**
   * `WSAutenticacao.rule` — valida a credencial inteira e devolve o token de
   * sessao. Nenhuma rotina do MK expoe total (`WSMKConsultaClientes` e
   * `WSMKFaturasAbertas` devolvem array puro), entao as contagens ficam `null`.
   */
  private async preflightMk(input: PreflightInput): Promise<PreflightResult> {
    const cfg = this.configObjeto(input);
    const qs = new URLSearchParams({
      sys: String(cfg.sys),
      password: String(cfg.password),
      cd_servico: String(cfg.cd_servico),
      token: String(cfg.masterToken),
    });

    const data = await this.postJson(
      `https://${input.url}/mk/WSAutenticacao.rule?${qs.toString()}`,
      { 'Content-Type': 'application/json' },
      undefined,
    );

    if (String(data?.status ?? '').toUpperCase() !== 'OK' || !data?.Token) {
      return this.falha(
        `MK recusou a credencial: ${data?.mensagem ?? data?.status ?? 'sem detalhe'}`,
      );
    }

    return {
      status: 'ok',
      clientesVisiveis: null,
      faturasVisiveis: null,
      erro: null,
    };
  }

  // ------------------------------------------------------------ HUBSOFT

  /**
   * `POST /oauth/token` (grant password) — a chamada mais barata que valida a
   * credencial inteira. O unico endpoint de negocio implementado busca por
   * CPF/CNPJ de um cliente especifico e nao devolve total, entao as contagens
   * ficam `null`.
   */
  private async preflightHubsoft(
    input: PreflightInput,
  ): Promise<PreflightResult> {
    const cfg = this.configObjeto(input);

    const data = await this.postJson(
      `https://${input.url}/oauth/token`,
      { 'Content-Type': 'application/json' },
      {
        client_id: cfg.client_id,
        client_secret: cfg.client_secret ?? '',
        username: cfg.username,
        password: cfg.password,
        grant_type: 'password',
      },
    );

    if (!data?.access_token) {
      return this.falha(
        `Hubsoft nao emitiu token: ${data?.message ?? data?.error ?? 'sem detalhe'}`,
      );
    }

    return {
      status: 'ok',
      clientesVisiveis: null,
      faturasVisiveis: null,
      erro: null,
    };
  }

  // -------------------------------------------------------------- comuns

  private async postJson(
    url: string,
    headers: Record<string, string>,
    body?: unknown,
  ): Promise<any> {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
    });

    const texto = await response.text();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${this.resumeCorpo(texto)}`);
    }

    try {
      return JSON.parse(texto);
    } catch {
      throw new Error(`resposta nao e JSON: ${texto.slice(0, 200)}`);
    }
  }

  private leCampo(
    input: PreflightInput,
    campo: string,
    destino: 'autorization' | 'config',
  ): boolean {
    const valor =
      destino === 'autorization'
        ? input.autorization
        : this.configObjeto(input)[campo];

    return String(valor ?? '').trim().length > 0;
  }

  /** O `config` ja apareceu como string JSON no banco — normaliza os dois casos. */
  private configObjeto(input: PreflightInput): Record<string, any> {
    const cfg = input.config;
    if (!cfg) return {};
    if (typeof cfg === 'string') {
      try {
        return JSON.parse(cfg);
      } catch {
        return {};
      }
    }
    return cfg;
  }

  /**
   * Alguns ERPs devolvem pagina HTML de erro (o IXC responde 401 com o HTML
   * padrao do nginx). Sem isso, o motivo gravado na empresa vira um bloco de
   * markup no meio da mensagem que o operador le.
   */
  private resumeCorpo(texto: string): string {
    return String(texto ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160);
  }

  private numeroOuNull(valor: unknown): number | null {
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
  }

  /** Traduz o erro tecnico para algo acionavel por quem atende o cliente. */
  private motivoLegivel(err: any): string {
    const bruto = String(err?.message ?? err);

    if (err?.name === 'TimeoutError' || /timeout|abort/i.test(bruto)) {
      return 'O ERP nao respondeu no tempo limite. Verifique a URL e se o IP do servidor esta liberado no firewall do cliente.';
    }
    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(bruto)) {
      return 'Nao foi possivel resolver o endereco do ERP. Verifique a URL informada.';
    }
    if (/ECONNREFUSED|ECONNRESET|fetch failed/i.test(bruto)) {
      return 'Nao foi possivel conectar ao ERP. Verifique a URL e a liberacao de firewall.';
    }
    if (/HTTP 401|HTTP 403/.test(bruto)) {
      return `O ERP recusou a credencial (${bruto.slice(0, 120)}). Peca uma credencial com permissao de leitura em clientes e contas a receber.`;
    }
    if (/HTTP 404/.test(bruto)) {
      return 'Endpoint nao encontrado no ERP. Confira a URL — ela deve ser o host, sem caminho.';
    }
    return bruto.slice(0, 300);
  }

  private falha(erro: string): PreflightResult {
    return {
      status: 'falhou',
      clientesVisiveis: null,
      faturasVisiveis: null,
      erro,
    };
  }
}
