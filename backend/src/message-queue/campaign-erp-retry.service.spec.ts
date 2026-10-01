import {
  CampaignErpRetryService,
  ERP_RETRY_INTERVAL_MS,
  ERP_RETRY_MAX_ATTEMPTS_PER_DAY,
} from './campaign-erp-retry.service';
import type { RedisService } from '../redis/redis.service';

/**
 * O intervalo entre tentativas e o teto diario.
 *
 * O agendador roda a cada minuto. Sem estes dois controles, manter uma campanha
 * pendente enquanto o ERP esta fora significaria 60 tentativas por hora contra
 * um ERP que ja esta sofrendo, e um loop de dia inteiro sem ninguem perceber.
 */

/** Redis de mentira, com o mesmo contrato do `RedisService`. */
const redisFake = () => {
  const dados = new Map<string, unknown>();
  return {
    dados,
    get: jest.fn(async (key: string) => (dados.get(key) ?? null) as never),
    set: jest.fn(async (key: string, value: unknown) => {
      dados.set(key, value);
    }),
    del: jest.fn(async (key: string) => {
      dados.delete(key);
    }),
  };
};

const DATA = '2026-09-01';
const CAMPANHA = 'campanha-1';
const em = (iso: string) => new Date(iso);

describe('CampaignErpRetryService', () => {
  it('conta a primeira falha e so libera a proxima tentativa depois de 10 minutos', async () => {
    const redis = redisFake();
    const service = new CampaignErpRetryService(redis as unknown as RedisService);

    const state = await service.registerFailure({
      campaignId: CAMPANHA,
      date: DATA,
      now: em('2026-09-01T13:00:00.000Z'),
      lostRecipients: 300,
      reason: 'ERP nao respondeu',
      previous: null,
    });

    expect(state.attempts).toBe(1);
    expect(state.lostRecipients).toBe(300);

    expect(service.isDue(state, em('2026-09-01T13:09:59.000Z'))).toBe(false);
    expect(service.secondsUntilDue(state, em('2026-09-01T13:05:00.000Z'))).toBe(300);
    expect(service.isDue(state, em('2026-09-01T13:10:00.000Z'))).toBe(true);
    expect(ERP_RETRY_INTERVAL_MS).toBe(10 * 60 * 1000);
  });

  it('acumula as tentativas do dia e preserva o inicio da janela', async () => {
    const redis = redisFake();
    const service = new CampaignErpRetryService(redis as unknown as RedisService);

    const primeira = await service.registerFailure({
      campaignId: CAMPANHA,
      date: DATA,
      now: em('2026-09-01T13:00:00.000Z'),
      lostRecipients: 300,
      reason: 'ERP nao respondeu',
      previous: null,
    });

    const segunda = await service.registerFailure({
      campaignId: CAMPANHA,
      date: DATA,
      now: em('2026-09-01T13:10:00.000Z'),
      lostRecipients: 280,
      reason: 'ERP nao respondeu',
      previous: primeira,
    });

    expect(segunda.attempts).toBe(2);
    expect(segunda.firstAttemptAt).toBe(primeira.firstAttemptAt);
    expect(segunda.lostRecipients).toBe(280);
  });

  it('para de autorizar tentativa ao bater o teto do dia', async () => {
    const redis = redisFake();
    const service = new CampaignErpRetryService(redis as unknown as RedisService);

    let state = await service.registerFailure({
      campaignId: CAMPANHA,
      date: DATA,
      now: em('2026-09-01T13:00:00.000Z'),
      lostRecipients: 10,
      reason: 'ERP nao respondeu',
      previous: null,
    });

    while (state.attempts < ERP_RETRY_MAX_ATTEMPTS_PER_DAY) {
      expect(service.hasAttemptsLeft(state)).toBe(true);
      state = await service.registerFailure({
        campaignId: CAMPANHA,
        date: DATA,
        now: em('2026-09-01T13:00:00.000Z'),
        lostRecipients: 10,
        reason: 'ERP nao respondeu',
        previous: state,
      });
    }

    expect(state.attempts).toBe(ERP_RETRY_MAX_ATTEMPTS_PER_DAY);
    expect(service.hasAttemptsLeft(state)).toBe(false);
  });

  it('zera o contador na virada do dia — a chave carrega a data', async () => {
    const redis = redisFake();
    const service = new CampaignErpRetryService(redis as unknown as RedisService);

    const ontem = await service.registerFailure({
      campaignId: CAMPANHA,
      date: '2026-08-31',
      now: em('2026-08-31T13:00:00.000Z'),
      lostRecipients: 10,
      reason: 'ERP nao respondeu',
      previous: null,
    });

    expect(await service.get(CAMPANHA, DATA)).toBeNull();

    const hoje = await service.registerFailure({
      campaignId: CAMPANHA,
      date: DATA,
      now: em('2026-09-01T13:00:00.000Z'),
      lostRecipients: 10,
      reason: 'ERP nao respondeu',
      previous: ontem,
    });

    expect(hoje.attempts).toBe(1);
  });

  it('mantem o intervalo mesmo com o Redis fora', async () => {
    // `RedisService` degrada em silencio: `get` devolve null e `set` nao grava.
    // Se o intervalo dependesse so dele, um Redis indisponivel devolveria o
    // martelo de 60 tentativas por hora que esta classe existe para evitar.
    const redisMudo = {
      get: jest.fn(async () => null as never),
      set: jest.fn(async () => undefined),
      del: jest.fn(async () => undefined),
    };
    const service = new CampaignErpRetryService(redisMudo as unknown as RedisService);

    await service.registerFailure({
      campaignId: CAMPANHA,
      date: DATA,
      now: em('2026-09-01T13:00:00.000Z'),
      lostRecipients: 5,
      reason: 'ERP nao respondeu',
      previous: null,
    });

    const state = await service.get(CAMPANHA, DATA);

    expect(state?.attempts).toBe(1);
    expect(service.isDue(state!, em('2026-09-01T13:01:00.000Z'))).toBe(false);
  });

  it('nao deixa erro do Redis derrubar o tick do agendador', async () => {
    const redisQuebrado = {
      get: jest.fn(async () => {
        throw new Error('Redis connection lost');
      }),
      set: jest.fn(async () => {
        throw new Error('Redis connection lost');
      }),
      del: jest.fn(async () => undefined),
    };
    const service = new CampaignErpRetryService(redisQuebrado as unknown as RedisService);

    await expect(service.get(CAMPANHA, DATA)).resolves.toBeNull();
    await expect(
      service.registerFailure({
        campaignId: CAMPANHA,
        date: DATA,
        now: em('2026-09-01T13:00:00.000Z'),
        lostRecipients: 5,
        reason: 'ERP nao respondeu',
        previous: null,
      }),
    ).resolves.toMatchObject({ attempts: 1 });
  });

  it('limpa o estado quando a campanha conclui', async () => {
    const redis = redisFake();
    const service = new CampaignErpRetryService(redis as unknown as RedisService);

    await service.registerFailure({
      campaignId: CAMPANHA,
      date: DATA,
      now: em('2026-09-01T13:00:00.000Z'),
      lostRecipients: 5,
      reason: 'ERP nao respondeu',
      previous: null,
    });

    await service.clear(CAMPANHA, DATA);

    expect(await service.get(CAMPANHA, DATA)).toBeNull();
    expect(redis.dados.size).toBe(0);
  });
});
