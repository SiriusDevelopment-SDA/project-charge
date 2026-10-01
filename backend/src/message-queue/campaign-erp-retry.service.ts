import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/**
 * Estado do retry de uma campanha que nao pode ser disparada porque o ERP nao
 * respondeu.
 *
 * POR QUE ISSO EXISTE: o agendador roda a cada minuto (`@Cron('* * * * *')`).
 * Sem um registro de "quando foi a ultima tentativa", manter a campanha
 * pendente faria ela bater 60 vezes por hora num ERP que ja esta sofrendo.
 *
 * POR QUE REDIS E NAO COLUNA NOVA: e estado operacional de um dia, com prazo de
 * validade natural — nao e dado de negocio que alguem va consultar depois. Uma
 * coluna exigiria migration (que roda antes do deploy, com janela combinada) e
 * deixaria lixo permanente na tabela `campaigns` para resolver um problema de
 * comportamento. O Redis ja e infraestrutura do projeto e a chave expira
 * sozinha.
 *
 * POR QUE TAMBEM TEM MEMORIA: `RedisService` degrada em silencio — com o Redis
 * fora, `get` devolve `null` e `set` nao faz nada. Se o intervalo dependesse so
 * dele, um Redis indisponivel devolveria exatamente o martelo de 60 tentativas
 * por hora que esta classe existe para evitar. O mapa em memoria segura o
 * intervalo dentro do processo; o Redis faz o estado sobreviver a restart do
 * container e a mais de uma instancia.
 */
export interface CampaignErpRetryState {
  readonly campaignId: string;

  /** Data (yyyy-LL-dd) no fuso da campanha a que este estado pertence. */
  readonly date: string;

  /** Tentativas ja gastas hoje. Comeca em 1 na primeira falha. */
  readonly attempts: number;

  readonly firstAttemptAt: string;
  readonly lastAttemptAt: string;

  /** Destinatarios que ficaram de fora na ultima tentativa. */
  readonly lostRecipients: number;

  /** Motivo tecnico da ultima falha, para o log e para o relatorio. */
  readonly reason: string;
}

/** O intervalo pedido: uma nova tentativa a cada 10 minutos. */
export const ERP_RETRY_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Teto diario de tentativas. 12 x 10 min = 2 horas insistindo.
 *
 * Existe para o retry nao virar um loop silencioso de dia inteiro: passadas as
 * duas horas o problema deixou de ser instabilidade e virou incidente, a
 * campanha e concluida com o motivo real gravado no relatorio e o log sobe para
 * `error`. Sem teto, um ERP fora do ar o dia todo produziria ~50 rodadas sem
 * que nada mudasse de aparencia.
 */
export const ERP_RETRY_MAX_ATTEMPTS_PER_DAY = 12;

/** A partir daqui o log deixa de ser `warn` e vira `error`. */
export const ERP_RETRY_ESCALATE_AFTER_ATTEMPTS = 3;

/**
 * A chave ja carrega a data, entao o contador zera sozinho na virada do dia; o
 * TTL so limpa o registro depois que aquele dia acabou.
 */
const STATE_TTL_SECONDS = 26 * 60 * 60;

@Injectable()
export class CampaignErpRetryService {
  private readonly logger = new Logger(CampaignErpRetryService.name);

  /** Espelho do que foi para o Redis, valido enquanto o processo viver. */
  private readonly memoria = new Map<string, CampaignErpRetryState>();

  constructor(private readonly redisService: RedisService) {}

  private key(campaignId: string, date: string): string {
    return `campaign:erp-retry:${campaignId}:${date}`;
  }

  async get(
    campaignId: string,
    date: string,
  ): Promise<CampaignErpRetryState | null> {
    const key = this.key(campaignId, date);

    const local = this.memoria.get(key);
    if (local) return local;

    try {
      const remoto = await this.redisService.get<CampaignErpRetryState>(key);
      if (remoto) {
        // Rehidrata a memoria depois de um restart para o intervalo continuar
        // valendo mesmo se o Redis cair em seguida.
        this.memoria.set(key, remoto);
      }
      return remoto;
    } catch (err) {
      // Uma falha de leitura aqui NAO pode derrubar o tick do agendador: sem
      // estado, a campanha segue o caminho normal do dia.
      this.logger.warn(
        `Nao foi possivel ler o estado de retry da campanha ${campaignId}: ${
          (err as Error)?.message ?? err
        }`,
      );
      return null;
    }
  }

  /** Ja passaram os 10 minutos desde a ultima tentativa? */
  isDue(state: CampaignErpRetryState, now: Date): boolean {
    const last = new Date(state.lastAttemptAt).getTime();
    if (!Number.isFinite(last)) return true;
    return now.getTime() - last >= ERP_RETRY_INTERVAL_MS;
  }

  /** Segundos que faltam para a proxima tentativa — so para o log. */
  secondsUntilDue(state: CampaignErpRetryState, now: Date): number {
    const last = new Date(state.lastAttemptAt).getTime();
    if (!Number.isFinite(last)) return 0;
    const restante = ERP_RETRY_INTERVAL_MS - (now.getTime() - last);
    return restante > 0 ? Math.ceil(restante / 1000) : 0;
  }

  hasAttemptsLeft(state: CampaignErpRetryState | null): boolean {
    return (state?.attempts ?? 0) < ERP_RETRY_MAX_ATTEMPTS_PER_DAY;
  }

  /**
   * Registra mais uma tentativa frustrada e devolve o estado resultante.
   * `previous` e o estado que o agendador ja tinha em maos — evita uma leitura
   * a mais no mesmo tick.
   */
  async registerFailure(params: {
    campaignId: string;
    date: string;
    now: Date;
    lostRecipients: number;
    reason: string;
    previous: CampaignErpRetryState | null;
  }): Promise<CampaignErpRetryState> {
    const { campaignId, date, now, lostRecipients, reason, previous } = params;
    const anterior = previous?.date === date ? previous : null;
    const nowIso = now.toISOString();

    const state: CampaignErpRetryState = {
      campaignId,
      date,
      attempts: (anterior?.attempts ?? 0) + 1,
      firstAttemptAt: anterior?.firstAttemptAt ?? nowIso,
      lastAttemptAt: nowIso,
      lostRecipients,
      reason,
    };

    const key = this.key(campaignId, date);
    this.memoria.set(key, state);
    this.prune(now);

    try {
      await this.redisService.set(key, state, STATE_TTL_SECONDS);
    } catch (err) {
      // O intervalo continua garantido pela memoria; so o efeito entre
      // reinicios se perde. Nao e motivo para derrubar o disparo.
      this.logger.warn(
        `Nao foi possivel persistir o estado de retry da campanha ${campaignId}: ${
          (err as Error)?.message ?? err
        }`,
      );
    }

    return state;
  }

  /** Chamado quando a campanha conclui — com sucesso ou desistindo. */
  async clear(campaignId: string, date: string): Promise<void> {
    const key = this.key(campaignId, date);
    this.memoria.delete(key);
    try {
      await this.redisService.del(key);
    } catch (err) {
      this.logger.warn(
        `Nao foi possivel limpar o estado de retry da campanha ${campaignId}: ${
          (err as Error)?.message ?? err
        }`,
      );
    }
  }

  /**
   * Descarta em memoria o que ja passou da validade — o Redis expira sozinho.
   *
   * O corte e por idade, e nao por "data diferente da atual": campanhas em
   * fusos diferentes tem `date` diferentes no MESMO instante, e comparar com um
   * unico "hoje" jogaria fora o estado da campanha do outro fuso.
   */
  private prune(now: Date): void {
    const limite = now.getTime() - STATE_TTL_SECONDS * 1000;
    for (const [key, state] of this.memoria) {
      const last = new Date(state.lastAttemptAt).getTime();
      if (!Number.isFinite(last) || last < limite) this.memoria.delete(key);
    }
  }
}
