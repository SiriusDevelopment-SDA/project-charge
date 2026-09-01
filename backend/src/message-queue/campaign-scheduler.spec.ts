import { CampaignScheduler } from './campaign-scheduler';
import {
  CampaignErpRetryService,
  ERP_RETRY_MAX_ATTEMPTS_PER_DAY,
} from './campaign-erp-retry.service';
import type { RedisService } from '../redis/redis.service';
import type { Campaign } from '../campaigns/entities/campanhas.entity';
import type {
  BuildQueueRecipientsResult,
  DispatchSkipRecord,
} from '../templates/template-dispatch-payload.service';
import type { MessageQueuePayload } from './entities/message-queue.entity';

/**
 * ERP fora do ar no horario da campanha.
 *
 * O DEFEITO QUE ESTES TESTES TRANCAM: o preload de faturas consultava o ERP ao
 * vivo dentro de um try/catch por cliente. Com o ERP fora, a lista voltava
 * vazia, cada destinatario virava um "sem fatura em aberto" e a campanha
 * gravava `lastDispatchedAt` de hoje — a trava de reenvio entendia que ela ja
 * tinha disparado e a campanha inteira se perdia pelo resto do dia, com o
 * relatorio dizendo que ninguem devia nada.
 *
 * O que precisa continuar verdadeiro:
 *   1. ERP sem responder NAO conclui a campanha;
 *   2. a nova tentativa respeita o intervalo de 10 minutos (o agendador roda a
 *      cada minuto — sem isso seriam 60 tentativas por hora no ERP caido);
 *   3. cliente sem fatura com ERP saudavel continua sendo skip legitimo e a
 *      campanha conclui;
 *   4. quem ja foi enfileirado NUNCA e reprocessado numa retentativa.
 */

/** 10:30 em America/Sao_Paulo — depois do horario agendado (10:00). */
const DISPARO = '2026-09-01T13:30:00.000Z';
const maisTarde = (minutos: number) =>
  new Date(new Date(DISPARO).getTime() + minutos * 60_000).toISOString();

const redisFake = () => {
  const dados = new Map<string, unknown>();
  return {
    get: jest.fn(async (key: string) => (dados.get(key) ?? null) as never),
    set: jest.fn(async (key: string, value: unknown) => {
      dados.set(key, value);
    }),
    del: jest.fn(async (key: string) => {
      dados.delete(key);
    }),
  };
};

const linha = (sufixo: string) => ({
  clientId: `cliente-${sufixo}`,
  whatsapp: `551199999000${sufixo}`,
  nome_cliente: `Cliente ${sufixo}`,
  invoice_id: `fatura-${sufixo}`,
});

const destinatario = (sufixo: string): MessageQueuePayload => ({
  number: `551199999000${sufixo}`,
  name: `Cliente ${sufixo}`,
  components: [],
});

const skip = (
  sufixo: string,
  reason: DispatchSkipRecord['reason'],
): DispatchSkipRecord => ({
  reason,
  number: `551199999000${sufixo}`,
  name: `Cliente ${sufixo}`,
  clientId: `cliente-${sufixo}`,
  invoiceId: `fatura-${sufixo}`,
  detail: 'motivo tecnico',
});

const campanha = (extra: Partial<Campaign> = {}) =>
  ({
    id: 'campanha-1',
    status: 'queue',
    isEnabled: true,
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T00:00:00.000Z'),
    dispatchTime: '10:00',
    timezone: 'America/Sao_Paulo',
    channelId: null,
    recurring: true,
    recurringType: 'daily',
    recurringDays: [],
    lastDispatchedAt: null,
    invoiceRule: { operator: 'antes', daysFrom: 1, daysTo: 1 },
    company: { id: 'empresa-1', account_chatwoot: '7' },
    template: { id: 'template-1' },
    ...extra,
  }) as unknown as Campaign;

type Resposta = (rows: Record<string, unknown>[]) => BuildQueueRecipientsResult;

const cenario = (opts: {
  campaign?: Campaign;
  rows?: Record<string, unknown>[];
  build: Resposta;
}) => {
  const campaign = opts.campaign ?? campanha();
  const rows = opts.rows ?? [linha('1'), linha('2'), linha('3')];

  const campaignRepository = {
    find: jest.fn(async () => [campaign]),
    // Só é lido no modo estático (campanha sem régua dinâmica), onde os
    // destinatários vêm do snapshot gravado na própria campanha.
    findOne: jest.fn(async () => ({ id: campaign.id, templateMapVars: rows })),
    update: jest.fn(async (_id: string, patch: Partial<Campaign>) => {
      Object.assign(campaign, patch);
    }),
  };

  /** Espelha o banco: acumula o que ja foi enfileirado hoje para a empresa. */
  const enfileiradosHoje = new Set<string>();
  const messageQueueService = {
    enqueueBatch: jest.fn(
      async (params: { recipients: MessageQueuePayload[] }) => {
        params.recipients.forEach((r) => enfileiradosHoje.add(r.number));
        return {
          batch: { id: 'lote-1', totalRecipients: params.recipients.length },
          skipped: 0,
          dedupedRecipients: [] as MessageQueuePayload[],
        };
      },
    ),
    getNumbersEnqueuedToday: jest.fn(async () => new Set(enfileiradosHoje)),
  };

  const templateDispatchPayload = {
    buildQueueRecipients: jest.fn(
      async (_t: unknown, _c: string, linhas: Record<string, unknown>[]) =>
        opts.build(linhas),
    ),
    persistDispatchSkips: jest.fn(
      async (
        _template: unknown,
        _companyId: string,
        _campaignId: string | null,
        _batchId: string | null,
        _skips: DispatchSkipRecord[],
      ) => undefined,
    ),
  };

  const invoicesService = {
    getRecipientsForDispatchDate: jest.fn(async () => rows),
  };

  const scheduler = new CampaignScheduler(
    campaignRepository as never,
    { findOne: jest.fn(async () => ({ id: 'template-1' })) } as never,
    { findOne: jest.fn(async () => ({ lastSuccessAt: new Date(DISPARO) })) } as never,
    messageQueueService as never,
    templateDispatchPayload as never,
    { emitCampaignsSync: jest.fn() } as never,
    invoicesService as never,
    { syncCompanyById: jest.fn() } as never,
    new CampaignErpRetryService(redisFake() as unknown as RedisService),
  );

  jest.spyOn(scheduler['logger'], 'log').mockImplementation();
  jest.spyOn(scheduler['logger'], 'warn').mockImplementation();
  const erro = jest.spyOn(scheduler['logger'], 'error').mockImplementation();

  const tick = async (iso: string) => {
    jest.setSystemTime(new Date(iso));
    await scheduler.checkAndDispatchCampaigns();
  };

  /** O que a conclusao do lote faz com a campanha (`syncCampaignStatusFromBatch`). */
  const loteConcluido = (iso: string) => {
    campaign.status = 'queue';
    campaign.lastDispatchedAt = new Date(iso);
  };

  return {
    campaign,
    campaignRepository,
    messageQueueService,
    templateDispatchPayload,
    invoicesService,
    erro,
    tick,
    loteConcluido,
    linhasRecebidas: () =>
      templateDispatchPayload.buildQueueRecipients.mock.calls.map((c) => c[2]),
  };
};

const erpForaDoAr: Resposta = (rows) => ({
  recipients: [],
  skips: rows.map((r) =>
    skip(String(r.clientId).replace('cliente-', ''), 'erp_unavailable'),
  ),
});

const erpSaudavel: Resposta = (rows) => ({
  recipients: rows.map((r) =>
    destinatario(String(r.clientId).replace('cliente-', '')),
  ),
  skips: [],
});

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('CampaignScheduler — ERP indisponivel', () => {
  it('nao marca a campanha como executada quando o ERP nao responde', async () => {
    const c = cenario({ build: erpForaDoAr });

    await c.tick(DISPARO);

    expect(c.templateDispatchPayload.buildQueueRecipients).toHaveBeenCalledTimes(1);
    // Nada de lastDispatchedAt e nada de 'finished': a campanha continua pendente.
    expect(c.campaignRepository.update).not.toHaveBeenCalled();
    expect(c.campaign.lastDispatchedAt).toBeNull();
    expect(c.campaign.status).toBe('queue');
    // O relatorio so recebe o desfecho quando o disparo termina — gravar
    // "nao enviado" a cada 10 minutos encheria a tela de linhas que a tentativa
    // seguinte desmente.
    expect(c.templateDispatchPayload.persistDispatchSkips).not.toHaveBeenCalled();
  });

  it('nao tenta de novo antes de 10 minutos', async () => {
    const c = cenario({ build: erpForaDoAr });

    await c.tick(DISPARO);
    await c.tick(maisTarde(1));
    await c.tick(maisTarde(5));
    await c.tick(maisTarde(9));

    expect(c.templateDispatchPayload.buildQueueRecipients).toHaveBeenCalledTimes(1);
    expect(c.invoicesService.getRecipientsForDispatchDate).toHaveBeenCalledTimes(1);
  });

  it('tenta de novo depois de 10 minutos', async () => {
    const c = cenario({ build: erpForaDoAr });

    await c.tick(DISPARO);
    await c.tick(maisTarde(5));
    await c.tick(maisTarde(10));

    expect(c.templateDispatchPayload.buildQueueRecipients).toHaveBeenCalledTimes(2);
    expect(c.campaignRepository.update).not.toHaveBeenCalled();
  });

  it('dispara normalmente quando o ERP volta', async () => {
    let erpVivo = false;
    const c = cenario({
      build: (rows) => (erpVivo ? erpSaudavel(rows) : erpForaDoAr(rows)),
    });

    await c.tick(DISPARO);
    erpVivo = true;
    await c.tick(maisTarde(10));

    expect(c.messageQueueService.enqueueBatch).toHaveBeenCalledTimes(1);
    expect(c.messageQueueService.enqueueBatch.mock.calls[0][0].recipients).toHaveLength(3);
    expect(c.campaignRepository.update).toHaveBeenCalledWith('campanha-1', {
      status: 'running',
    });
    expect(c.campaign.lastDispatchedAt).toBeNull();

    // Estado do dia limpo: um novo tick nao pode achar que ha retentativa aberta.
    c.loteConcluido(maisTarde(11));
    await c.tick(maisTarde(30));
    expect(c.templateDispatchPayload.buildQueueRecipients).toHaveBeenCalledTimes(2);
  });

  it('desiste depois do teto diario e conclui gravando o motivo real', async () => {
    const c = cenario({ build: erpForaDoAr });

    for (let tentativa = 0; tentativa < ERP_RETRY_MAX_ATTEMPTS_PER_DAY; tentativa++) {
      await c.tick(maisTarde(tentativa * 10));
    }

    expect(c.templateDispatchPayload.buildQueueRecipients).toHaveBeenCalledTimes(
      ERP_RETRY_MAX_ATTEMPTS_PER_DAY,
    );

    // Na ultima tentativa a campanha conclui: relatorio com o motivo real e
    // log de erro para alguem perceber que o ERP ficou fora.
    const gravados = c.templateDispatchPayload.persistDispatchSkips.mock.calls;
    expect(gravados).toHaveLength(1);
    expect(gravados[0][4]).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: 'erp_unavailable' })]),
    );
    expect(c.campaign.lastDispatchedAt).toEqual(new Date(maisTarde(110)));
    expect(c.erro).toHaveBeenCalledWith(expect.stringContaining('limite diário'));

    // E para de tentar: o dia acabou para esta campanha.
    await c.tick(maisTarde(120));
    expect(c.templateDispatchPayload.buildQueueRecipients).toHaveBeenCalledTimes(
      ERP_RETRY_MAX_ATTEMPTS_PER_DAY,
    );
  });
});

describe('CampaignScheduler — ERP saudavel', () => {
  it('conclui a campanha quando ninguem tem fatura em aberto', async () => {
    const c = cenario({
      build: (rows) => ({
        recipients: [],
        skips: rows.map((r) =>
          skip(String(r.clientId).replace('cliente-', ''), 'invoice_not_open_in_erp'),
        ),
      }),
    });

    await c.tick(DISPARO);

    expect(c.campaignRepository.update).toHaveBeenCalledWith('campanha-1', {
      lastDispatchedAt: new Date(DISPARO),
      status: 'queue',
    });
    expect(c.templateDispatchPayload.persistDispatchSkips).toHaveBeenCalledTimes(1);

    // Concluida: nao volta a tentar hoje.
    await c.tick(maisTarde(10));
    expect(c.templateDispatchPayload.buildQueueRecipients).toHaveBeenCalledTimes(1);
  });
});

describe('CampaignScheduler — entrega parcial', () => {
  it('nao reenvia para quem ja foi enfileirado quando o ERP volta', async () => {
    // O ERP responde por 1 e 2 e falha em 3. E o caso mais perigoso da
    // correcao: se a retentativa reprocessasse a campanha inteira, 1 e 2
    // receberiam a mesma cobranca duas vezes.
    let erpVivo = false;
    const c = cenario({
      build: (rows) => {
        if (erpVivo) return erpSaudavel(rows);
        const ok = rows.filter((r) => r.clientId !== 'cliente-3');
        const falhou = rows.filter((r) => r.clientId === 'cliente-3');
        return {
          recipients: ok.map((r) =>
            destinatario(String(r.clientId).replace('cliente-', '')),
          ),
          skips: falhou.map((r) =>
            skip(String(r.clientId).replace('cliente-', ''), 'erp_unavailable'),
          ),
        };
      },
    });

    await c.tick(DISPARO);

    expect(c.messageQueueService.enqueueBatch.mock.calls[0][0].recipients).toHaveLength(2);
    // Parte saiu, mas o disparo nao terminou: 'running' sem lastDispatchedAt.
    expect(c.campaignRepository.update).toHaveBeenCalledWith('campanha-1', {
      status: 'running',
    });
    expect(c.campaign.lastDispatchedAt).toBeNull();

    // O worker conclui o lote e devolve a campanha para a fila, gravando o
    // lastDispatchedAt de hoje — a trava que, sem o estado de retry, mataria a
    // segunda tentativa.
    c.loteConcluido(maisTarde(2));

    erpVivo = true;
    await c.tick(maisTarde(10));

    // A segunda tentativa ve apenas o cliente que ficou faltando.
    const linhasDaRetentativa = c.linhasRecebidas()[1];
    expect(linhasDaRetentativa).toHaveLength(1);
    expect(linhasDaRetentativa[0]).toMatchObject({ clientId: 'cliente-3' });

    const segundoLote = c.messageQueueService.enqueueBatch.mock.calls[1][0];
    expect(segundoLote.recipients.map((r: MessageQueuePayload) => r.number)).toEqual([
      '5511999990003',
    ]);
  });

  it('nao retenta campanha nao recorrente que ja enfileirou parte dos destinatarios', async () => {
    // Campanha unica vira 'finished' na conclusao do lote e o agendador nunca
    // mais a seleciona: esta e a ultima chance de gravar o motivo no relatorio.
    const c = cenario({
      campaign: campanha({ recurring: false } as Partial<Campaign>),
      build: (rows) => ({
        recipients: rows
          .filter((r) => r.clientId !== 'cliente-3')
          .map((r) => destinatario(String(r.clientId).replace('cliente-', ''))),
        skips: rows
          .filter((r) => r.clientId === 'cliente-3')
          .map((r) => skip(String(r.clientId).replace('cliente-', ''), 'erp_unavailable')),
      }),
    });

    await c.tick(DISPARO);

    expect(c.templateDispatchPayload.persistDispatchSkips).toHaveBeenCalledTimes(1);
    expect(
      c.templateDispatchPayload.persistDispatchSkips.mock.calls[0][4],
    ).toEqual([expect.objectContaining({ reason: 'erp_unavailable' })]);
    expect(c.campaignRepository.update).toHaveBeenCalledWith('campanha-1', {
      status: 'running',
      lastDispatchedAt: new Date(DISPARO),
    });
  });
});

describe('CampaignScheduler — falha ao montar a lista de destinatarios', () => {
  it('mantem a campanha pendente quando a busca de destinatarios falha', async () => {
    const c = cenario({ build: erpSaudavel });
    c.invoicesService.getRecipientsForDispatchDate.mockRejectedValueOnce(
      new Error('connection terminated unexpectedly'),
    );

    await c.tick(DISPARO);

    expect(c.templateDispatchPayload.buildQueueRecipients).not.toHaveBeenCalled();
    expect(c.campaignRepository.update).not.toHaveBeenCalled();
    expect(c.campaign.lastDispatchedAt).toBeNull();

    await c.tick(maisTarde(10));
    expect(c.messageQueueService.enqueueBatch).toHaveBeenCalledTimes(1);
  });
});
