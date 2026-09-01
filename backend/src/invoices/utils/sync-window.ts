import { Company } from '../../companies/entities/companies';

/**
 * Limites aceitos para `syncLookbackDays` e `syncLookaheadDays`.
 *
 * Abaixo de 1 a janela seria vazia ou invertida; acima de 10 anos ela deixa de
 * ser uma janela e vira "a base inteira", que e exatamente o que a configuracao
 * existe para evitar. Fora do intervalo, o valor e IGNORADO e aquele lado da
 * janela cai no default — nunca gera janela invalida.
 */
export const SYNC_LOOKBACK_DAYS_MIN = 1;
export const SYNC_LOOKBACK_DAYS_MAX = 3650;

export const SYNC_LOOKAHEAD_DAYS_MIN = 1;
export const SYNC_LOOKAHEAD_DAYS_MAX = 3650;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** `config` e um `jsonb` livre e ja apareceu como string JSON no banco. */
function lerConfig(
  company: Pick<Company, 'config'> | null | undefined,
): Record<string, unknown> {
  const config = company?.config;
  if (!config) return {};
  if (typeof config === 'string') {
    try {
      return JSON.parse(config) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return config as Record<string, unknown>;
}

/**
 * Le uma chave de ajuste em dias do `config` da empresa. Devolve `null` quando
 * ausente, ilegivel ou fora dos limites — cabe ao chamador aplicar o default.
 *
 * Aceita numero ou string numerica porque o `config` e escrito historicamente a
 * mao (ver `companies/config.contract.ts`). Fracionario e truncado para baixo.
 */
function lerAjusteEmDias(
  company: Pick<Company, 'config'> | null | undefined,
  chave: string,
  min: number,
  max: number,
): number | null {
  const bruto = lerConfig(company)[chave];
  if (bruto === undefined || bruto === null || bruto === '') return null;

  // So numero ou string numerica. O guard de tipo NAO e redundante: Number(true)
  // e 1 e Number([30]) e 30, entao sem ele um `syncLookbackDays: true` viraria
  // silenciosamente uma janela de 1 DIA — o pior default possivel, porque a sync
  // pareceria funcionar e o snapshot nasceria quase vazio.
  if (typeof bruto !== 'number' && typeof bruto !== 'string') return null;

  const numero = Number(bruto);
  if (!Number.isFinite(numero)) return null;

  const dias = Math.floor(numero);
  if (dias < min || dias > max) return null;

  return dias;
}

/** Dias PARA TRAS configurados, ou `null` para usar o default de anos. */
export function lerSyncLookbackDays(
  company: Pick<Company, 'config'> | null | undefined,
): number | null {
  return lerAjusteEmDias(
    company,
    'syncLookbackDays',
    SYNC_LOOKBACK_DAYS_MIN,
    SYNC_LOOKBACK_DAYS_MAX,
  );
}

/** Dias PARA FRENTE configurados, ou `null` para usar 31/12 do ano corrente. */
export function lerSyncLookaheadDays(
  company: Pick<Company, 'config'> | null | undefined,
): number | null {
  return lerAjusteEmDias(
    company,
    'syncLookaheadDays',
    SYNC_LOOKAHEAD_DAYS_MIN,
    SYNC_LOOKAHEAD_DAYS_MAX,
  );
}

/** Fim historico da janela: 31/12 do ano corrente, ate o ultimo milissegundo. */
function fimPadrao(now: Date): Date {
  return new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
}

/**
 * Janela de vencimento da sincronizacao de faturas.
 *
 * Os dois lados sao configuraveis por empresa, e cada um existe por um motivo
 * diferente. Sem configuracao, a janela e a historica: de `fallbackYears` anos
 * atras ate 31/12 do ano corrente.
 *
 * O INICIO (`config.syncLookbackDays`) E CUSTO.
 *
 * A janela de 1 ano e barata em ERP que aceita filtro de data. Na Gama ISP nao
 * existe filtro nenhum — so paginacao ordenada por `data_vencimento desc` — entao
 * o inicio da janela e o que decide ONDE A VARREDURA PARA, ou seja, quantas
 * paginas ela percorre. Medido contra a POWERNET:
 *
 *   - a borda de 1 ano atras cai por volta do offset 50.000, ~500 paginas de 100;
 *   - a API degrada com offset profundo: 10,9s por pagina no offset 1.000, 13,0s
 *     no 30.000, 15,9s no 45.000;
 *   - a taxa de rede observada no container durante a sync real foi de 3,3 KB/s
 *     para paginas de ~95 KB, ou seja ~29s por pagina na pratica;
 *   - total estimado: 2 a 4 HORAS por sincronizacao, repetidas toda madrugada,
 *     porque a API tambem nao permite sync incremental.
 *
 * Uma sincronizacao real chegou a ser interrompida por isso.
 *
 * O FIM (`config.syncLookaheadDays`) NAO E CUSTO — E CORRECAO.
 *
 * Nao adianta encurtar o fim esperando ganho de desempenho: como a paginacao vem
 * da fatura mais distante para tras, quem determina a parada e o inicio; o fim
 * apenas descarta linhas no caminho. O que ele resolve sao tres defeitos do
 * 31/12 fixo:
 *
 *   1. a janela ENCOLHE ao longo do ano — em agosto cobre ~5,5 meses a frente,
 *      em 20/dez cobre ~10 dias;
 *   2. na virada do ano ela SALTA — em 31/12 o fim e 31/12 do mesmo ano, em
 *      01/01 vira 31/12 do ano seguinte, e um ano inteiro de faturas futuras
 *      entra de uma vez, deixando a primeira sync de janeiro muito mais pesada;
 *   3. ponto cego de dezembro: uma fatura que vence em 10/01 do ano seguinte fica
 *      FORA da janela durante todo o ano corrente, entao campanha e regua — que
 *      leem o snapshot — simplesmente nao a enxergam.
 *
 * Com `syncLookaheadDays`, a cobertura a frente passa a ser constante e previsivel.
 *
 * O fim tambem delimita o `closeMissingOpenInvoices`: fatura fora da janela nao e
 * buscada E nao e marcada como paga, entao encurtar o fim nao da baixa indevida.
 */
export function resolveSyncWindow(
  company: Pick<Company, 'config'> | null | undefined,
  opcoes: { fallbackYears: number; now?: Date },
): { start: Date; end: Date } {
  const now = opcoes.now ?? new Date();

  const diasAtras = lerSyncLookbackDays(company);
  const diasAFrente = lerSyncLookaheadDays(company);

  // Sem configuracao valida, reproduz EXATAMENTE o calculo antigo
  // (`setFullYear(ano - N)`), inclusive a semantica de calendario em ano
  // bissexto — nenhum ERP ja existente muda de comportamento por causa disto.
  const start =
    diasAtras === null
      ? (() => {
          const inicio = new Date(now);
          inicio.setFullYear(inicio.getFullYear() - opcoes.fallbackYears);
          return inicio;
        })()
      : new Date(now.getTime() - diasAtras * MS_POR_DIA);

  const end =
    diasAFrente === null
      ? fimPadrao(now)
      : new Date(now.getTime() + diasAFrente * MS_POR_DIA);

  // INVARIANTE: a janela nunca pode sair invertida daqui. Com os limites atuais
  // (ambos >= 1 dia) isto e inalcancavel — start fica sempre antes de `now` e end
  // sempre depois. O guard existe para que MEXER nos limites um dia (permitir 0,
  // ou dias negativos para excluir o futuro) nao produza em silencio uma janela
  // vazia: sem faturas, o `persistSnapshot` aborta ou marca tudo como pago. Cair
  // no fim padrao sempre restaura a invariante, porque 31/12 do ano corrente e
  // por construcao posterior a `now`.
  if (start.getTime() >= end.getTime()) {
    return { start, end: fimPadrao(now) };
  }

  return { start, end };
}
