import { INDICATORS, INDICATOR_IDS, type IndicatorId } from './indicators';
import type { Candle, Timeframe } from './types';

/** Idade máxima (s) do último candle para um sinal ainda valer o aviso: evita avisar sinal velho depois de um fim de semana/feriado. */
export const MAX_AGE_S: Record<Timeframe, number> = {
  '1m': 600, '5m': 1800, '15m': 3600, '30m': 7200, '60m': 4 * 3600, '1d': 5 * 86400, '1wk': 14 * 86400, '1mo': 45 * 86400,
};

export const validBells = (x: unknown): IndicatorId[] =>
  Array.isArray(x) ? INDICATOR_IDS.filter((id) => x.includes(id)) : [];

export type Fired = { id: IndicatorId; side: 1 | -1; last: Candle; sideText: 'compra' | 'venda' };

/** Sinal do indicador no último candle (ou null se não houver ou se o candle estiver velho demais). */
export function latestSignal(candles: Candle[], id: IndicatorId, tf: Timeframe, nowS = Date.now() / 1000): Fired | null {
  const last = candles.at(-1);
  if (!last || nowS - last.time > (MAX_AGE_S[tf] ?? 86400)) return null;
  const sg = INDICATORS[id].signals(candles).at(-1) ?? 0;
  if (sg === 0) return null;
  return { id, side: sg > 0 ? 1 : -1, last, sideText: sg > 0 ? 'compra' : 'venda' };
}

/** Identifica o sinal para não avisar duas vezes (indicador + candle + direção). */
export const signalKey = (scope: string, f: Fired) => `${scope}|${f.id}|${f.last.time}|${f.side}`;

export const signalTitle = (symbol: string, tf: string, f: Fired) => `🔔 ${symbol} · ${tf}: possível ${f.sideText}`;
export const signalBody = (f: Fired) => `${INDICATORS[f.id].label} deu sinal de ${f.sideText}. Último preço: ${f.last.close}. Não é recomendação.`;
