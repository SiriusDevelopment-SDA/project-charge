import type { Company } from '../../companies/entities/companies';
import {
  SYNC_LOOKAHEAD_DAYS_MAX,
  SYNC_LOOKBACK_DAYS_MAX,
  lerSyncLookaheadDays,
  lerSyncLookbackDays,
  resolveSyncWindow,
} from './sync-window';

/**
 * A janela de sincronizacao virou configuravel por empresa por causa de custo
 * medido (ver `sync-window.ts`). O que estes testes protegem, acima de tudo, e a
 * promessa de que a mudanca foi ADITIVA: empresa sem a chave precisa continuar
 * com exatamente a janela de 1 ano que IXC, SGP e MK sempre tiveram.
 */
describe('resolveSyncWindow', () => {
  // Data fixa para a janela ser deterministica.
  const AGORA = new Date(2026, 7, 31, 15, 30, 0); // 31/08/2026 15:30 local
  const PADRAO = { fallbackYears: 1, now: AGORA };

  const empresa = (config: Record<string, unknown> | string | null) =>
    ({ config }) as unknown as Company;

  describe('sem a chave (comportamento historico)', () => {
    it('usa a janela padrao de 1 ano quando o config nao tem a chave', () => {
      const { start, end } = resolveSyncWindow(empresa({}), PADRAO);

      expect(start).toEqual(new Date(2025, 7, 31, 15, 30, 0));
      expect(end).toEqual(new Date(2026, 11, 31, 23, 59, 59, 999));
    });

    it('usa a janela padrao quando nao ha config nenhum', () => {
      expect(resolveSyncWindow(empresa(null), PADRAO).start).toEqual(
        new Date(2025, 7, 31, 15, 30, 0),
      );
      expect(resolveSyncWindow(undefined, PADRAO).start).toEqual(
        new Date(2025, 7, 31, 15, 30, 0),
      );
    });

    it('respeita fallbackYears diferente de 1', () => {
      const { start } = resolveSyncWindow(empresa({}), {
        fallbackYears: 3,
        now: AGORA,
      });
      expect(start).toEqual(new Date(2023, 7, 31, 15, 30, 0));
    });
  });

  describe('com a chave configurada', () => {
    it('reduz a janela para os dias pedidos', () => {
      const { start, end } = resolveSyncWindow(
        empresa({ syncLookbackDays: 30 }),
        PADRAO,
      );

      expect(start).toEqual(new Date(2026, 7, 1, 15, 30, 0)); // 30 dias antes
      // O fim da janela nao muda: fatura ja emitida com vencimento futuro
      // continua entrando no snapshot.
      expect(end).toEqual(new Date(2026, 11, 31, 23, 59, 59, 999));
    });

    it('aceita string numerica (o config e jsonb livre, escrito a mao)', () => {
      const { start } = resolveSyncWindow(
        empresa({ syncLookbackDays: '15' }),
        PADRAO,
      );
      expect(start).toEqual(new Date(2026, 7, 16, 15, 30, 0));
    });

    it('le o config quando ele vem como string JSON', () => {
      const { start } = resolveSyncWindow(
        empresa(JSON.stringify({ syncLookbackDays: 7 })),
        PADRAO,
      );
      expect(start).toEqual(new Date(2026, 7, 24, 15, 30, 0));
    });

    it('trunca valor fracionario para baixo', () => {
      expect(lerSyncLookbackDays(empresa({ syncLookbackDays: 30.9 }))).toBe(30);
    });

    it('aceita os extremos do intervalo permitido', () => {
      expect(lerSyncLookbackDays(empresa({ syncLookbackDays: 1 }))).toBe(1);
      expect(
        lerSyncLookbackDays(
          empresa({ syncLookbackDays: SYNC_LOOKBACK_DAYS_MAX }),
        ),
      ).toBe(SYNC_LOOKBACK_DAYS_MAX);
    });
  });

  describe('valor invalido cai no default, nunca gera janela invalida', () => {
    const invalidos: [string, unknown][] = [
      ['zero', 0],
      ['negativo', -30],
      ['acima do teto', SYNC_LOOKBACK_DAYS_MAX + 1],
      ['texto', 'trinta'],
      ['booleano', true],
      // Number([30]) e 30: sem guard de tipo, um array passaria como valido.
      ['array', [30]],
      ['objeto', { dias: 30 }],
      ['string vazia', ''],
      ['NaN', NaN],
      ['Infinity', Infinity],
    ];

    it.each(invalidos)('ignora %s', (_rotulo, valor) => {
      expect(
        lerSyncLookbackDays(empresa({ syncLookbackDays: valor })),
      ).toBeNull();

      const { start } = resolveSyncWindow(
        empresa({ syncLookbackDays: valor }),
        PADRAO,
      );
      expect(start).toEqual(new Date(2025, 7, 31, 15, 30, 0));
    });

    it('ignora a chave quando o config e uma string JSON quebrada', () => {
      expect(lerSyncLookbackDays(empresa('{ nao e json'))).toBeNull();
    });

    it('a janela resultante nunca comeca depois de terminar', () => {
      for (const [, valor] of invalidos) {
        const { start, end } = resolveSyncWindow(
          empresa({ syncLookbackDays: valor }),
          PADRAO,
        );
        expect(start.getTime()).toBeLessThan(end.getTime());
      }
    });
  });
});

describe('resolveSyncWindow — fim da janela', () => {
  const AGORA = new Date(2026, 7, 31, 15, 30, 0); // 31/08/2026 15:30 local
  const PADRAO = { fallbackYears: 1, now: AGORA };
  const FIM_PADRAO = new Date(2026, 11, 31, 23, 59, 59, 999);

  const empresa = (config: Record<string, unknown> | string | null) =>
    ({ config }) as unknown as Company;

  describe('sem a chave (comportamento historico)', () => {
    it('termina em 31/12 do ano corrente', () => {
      expect(resolveSyncWindow(empresa({}), PADRAO).end).toEqual(FIM_PADRAO);
    });

    it('mantem o 31/12 mesmo com o inicio configurado', () => {
      const { start, end } = resolveSyncWindow(
        empresa({ syncLookbackDays: 30 }),
        PADRAO,
      );
      expect(start).toEqual(new Date(2026, 7, 1, 15, 30, 0));
      expect(end).toEqual(FIM_PADRAO);
    });

    it('reproduz o encolhimento historico da janela ao longo do ano', () => {
      // Documenta o defeito que a chave veio resolver: em dezembro a cobertura
      // a frente e de poucos dias, e vira um ano inteiro em 01/01.
      const emDezembro = resolveSyncWindow(empresa({}), {
        fallbackYears: 1,
        now: new Date(2026, 11, 20, 12, 0, 0),
      });
      const emJaneiro = resolveSyncWindow(empresa({}), {
        fallbackYears: 1,
        now: new Date(2027, 0, 1, 12, 0, 0),
      });

      expect(emDezembro.end).toEqual(new Date(2026, 11, 31, 23, 59, 59, 999));
      expect(emJaneiro.end).toEqual(new Date(2027, 11, 31, 23, 59, 59, 999));
    });
  });

  describe('com a chave configurada', () => {
    it('termina em now + N dias', () => {
      const { end } = resolveSyncWindow(
        empresa({ syncLookaheadDays: 60 }),
        PADRAO,
      );
      expect(end).toEqual(new Date(2026, 9, 30, 15, 30, 0)); // 30/10/2026
    });

    it('cobre janeiro do ano seguinte quando estamos em dezembro', () => {
      // O ponto cego: sem a chave, fatura de 10/01/2027 fica fora da janela
      // durante todo 2026 e some da campanha.
      const now = new Date(2026, 11, 20, 12, 0, 0);
      const semChave = resolveSyncWindow(empresa({}), { fallbackYears: 1, now });
      const comChave = resolveSyncWindow(empresa({ syncLookaheadDays: 60 }), {
        fallbackYears: 1,
        now,
      });
      const faturaDeJaneiro = new Date(2027, 0, 10, 0, 0, 0);

      expect(semChave.end.getTime()).toBeLessThan(faturaDeJaneiro.getTime());
      expect(comChave.end.getTime()).toBeGreaterThan(faturaDeJaneiro.getTime());
    });

    it('aceita string numerica e config como string JSON', () => {
      expect(lerSyncLookaheadDays(empresa({ syncLookaheadDays: '45' }))).toBe(45);
      expect(
        lerSyncLookaheadDays(empresa(JSON.stringify({ syncLookaheadDays: 7 }))),
      ).toBe(7);
    });

    it('aceita os extremos do intervalo permitido', () => {
      expect(lerSyncLookaheadDays(empresa({ syncLookaheadDays: 1 }))).toBe(1);
      expect(
        lerSyncLookaheadDays(
          empresa({ syncLookaheadDays: SYNC_LOOKAHEAD_DAYS_MAX }),
        ),
      ).toBe(SYNC_LOOKAHEAD_DAYS_MAX);
    });
  });

  describe('valor invalido cai no fim padrao', () => {
    const invalidos: [string, unknown][] = [
      ['zero', 0],
      ['negativo', -30],
      ['acima do teto', SYNC_LOOKAHEAD_DAYS_MAX + 1],
      ['texto', 'sessenta'],
      ['booleano', true],
      ['array', [60]],
      ['objeto', { dias: 60 }],
      ['string vazia', ''],
      ['NaN', NaN],
      ['Infinity', Infinity],
    ];

    it.each(invalidos)('ignora %s', (_rotulo, valor) => {
      expect(
        lerSyncLookaheadDays(empresa({ syncLookaheadDays: valor })),
      ).toBeNull();
      expect(
        resolveSyncWindow(empresa({ syncLookaheadDays: valor }), PADRAO).end,
      ).toEqual(FIM_PADRAO);
    });
  });

  describe('as duas chaves juntas', () => {
    it('aplica inicio e fim configurados ao mesmo tempo', () => {
      const { start, end } = resolveSyncWindow(
        empresa({ syncLookbackDays: 45, syncLookaheadDays: 15 }),
        PADRAO,
      );

      expect(start).toEqual(new Date(2026, 6, 17, 15, 30, 0)); // 45 dias antes
      expect(end).toEqual(new Date(2026, 8, 15, 15, 30, 0)); // 15 dias depois
    });

    it('um lado invalido nao contamina o outro', () => {
      const { start, end } = resolveSyncWindow(
        empresa({ syncLookbackDays: 45, syncLookaheadDays: 'lixo' }),
        PADRAO,
      );

      expect(start).toEqual(new Date(2026, 6, 17, 15, 30, 0)); // configurado
      expect(end).toEqual(FIM_PADRAO); // default
    });

    it('INVARIANTE: start sempre antes de end, em qualquer combinacao', () => {
      const valores: unknown[] = [
        undefined,
        1,
        30,
        3650,
        0,
        -30,
        99999,
        'lixo',
        true,
        [60],
        NaN,
      ];

      for (const atras of valores) {
        for (const aFrente of valores) {
          const { start, end } = resolveSyncWindow(
            empresa({
              syncLookbackDays: atras,
              syncLookaheadDays: aFrente,
            }),
            PADRAO,
          );
          expect(start.getTime()).toBeLessThan(end.getTime());
        }
      }
    });

    it('a janela minima possivel (1 dia para cada lado) continua valida', () => {
      const { start, end } = resolveSyncWindow(
        empresa({ syncLookbackDays: 1, syncLookaheadDays: 1 }),
        PADRAO,
      );

      expect(start).toEqual(new Date(2026, 7, 30, 15, 30, 0));
      expect(end).toEqual(new Date(2026, 8, 1, 15, 30, 0));
      expect(start.getTime()).toBeLessThan(end.getTime());
    });
  });
});
