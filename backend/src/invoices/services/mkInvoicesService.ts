import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Company } from '../../companies/entities/companies';
import { Client } from '../../clients/entities.ts/clients';
import { RedisService } from '../../redis/redis.service';

// Margem de segurança aplicada ao TTL do token de sessão, para renovar antes
// de o ERP de fato expirar o token e evitar 401 no meio de uma sincronização.
const MK_TOKEN_TTL_MARGIN_SECONDS = 300;
// Fallback de TTL quando não conseguimos parsear/calcular o "Expire" da resposta.
const MK_TOKEN_FALLBACK_TTL_SECONDS = 24 * 60 * 60; // 1 dia
// Teto de iterações da paginação por cursor, para nunca cair em loop infinito.
const MK_CLIENTS_PAGINATION_MAX_ITERATIONS = 10_000;

@Injectable()
export class MkInvoicesService {
  private readonly logger = new Logger('[MK] MkInvoicesService');

  constructor(private readonly redisService: RedisService) {}

  private async sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  private isRetryableNetworkError(err: unknown) {
    const anyErr = err as any;
    const name = anyErr?.name;
    const message = String(anyErr?.message ?? '');
    return (
      name === 'TimeoutError' ||
      name === 'AbortError' ||
      message.toLowerCase().includes('timeout') ||
      message.toLowerCase().includes('aborted') ||
      message.toLowerCase().includes('fetch failed')
    );
  }

  private parseConfig(company: Company): MkConfig {
    const config =
      typeof company.config === 'string'
        ? JSON.parse(company.config)
        : (company.config ?? {});

    const sys = config.sys;
    const password = config.password;
    const cd_servico = config.cd_servico;
    const masterToken = config.masterToken;

    if (!sys || !password || !cd_servico || !masterToken) {
      throw new BadRequestException(
        '[MK] Credenciais da MK/PROXER não configuradas (sys/password/cd_servico/masterToken)',
      );
    }
    if (!company.url) {
      throw new BadRequestException('[MK] URL da MK/PROXER não configurada');
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
    const expireDate = DateTime.fromFormat(expire.trim(), 'dd/MM/yyyy HH:mm:ss');
    if (!expireDate.isValid) return null;
    const ttl = Math.floor(expireDate.diffNow('seconds').seconds) - MK_TOKEN_TTL_MARGIN_SECONDS;
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

    const { sys, password, cd_servico, masterToken } = this.parseConfig(company);
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
          method: 'POST',
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

    const data: MkAuthResponse = await response.json();
    if (data?.status !== 'OK' || !data?.Token) {
      throw new BadRequestException(
        `[MK] Falha na autenticação: ${JSON.stringify(data).slice(0, 300)}`,
      );
    }

    const ttlSeconds = this.computeTokenTtlSeconds(data.Expire) ?? MK_TOKEN_FALLBACK_TTL_SECONDS;
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
  async fetchClients(company: Company, _since?: Date): Promise<MkClientRecord[]> {
    const { sys, config } = this.parseConfig(company);
    const timeoutMs = Number(config?.timeoutMs ?? 90_000);
    const maxRetries = Number(config?.retries ?? 3);

    const all: MkClientRecord[] = [];
    const seenCodes = new Set<number>();
    let cursor = 0;
    let authRetried = false;

    for (let iteration = 0; iteration < MK_CLIENTS_PAGINATION_MAX_ITERATIONS; iteration++) {
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
            method: 'GET',
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
        const error = new Error(`[MK] clientes — falha de rede ao acessar ${url}`);
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

      const data = await response.json();
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
    const cnpj_cpf = String(record.CPF_CNPJ ?? '').replace(/\D/g, '');
    if (!cnpj_cpf) return null;

    const whatsapp = String(record.Fone ?? '').replace(/\D/g, '');
    if (!whatsapp) return null;

    // Endereço: prefere o item marcado como COBRANCA, senão o primeiro.
    const enderecos = Array.isArray(record.endereco) ? record.endereco : [];
    const endereco =
      enderecos.find((e) => e?.tipo === 'COBRANCA') ?? enderecos[0];

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
        zipCode: String(endereco.cep).replace(/\D/g, '').slice(0, 9),
      }),
      companyId: company.id,
    };
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
