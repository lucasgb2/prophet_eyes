/** Como o preço andou depois de uma notícia, comparado ao movimento normal do papel. Funções puras. */
import { sma } from '../indicators';
import { PERIOD_S } from '../next-candle';
import type { Candle, Timeframe } from '../types';

export const NEWS_HORIZONS = [1, 5, 15];
const BASELINE = 100; // candles anteriores usados para saber o que é um movimento normal

export type Move = { h: number; pct: number; times: number | null };
/**
 * Por que a reação não é "limpa":
 * - gap: no intraday, entre a referência e o candle seguinte a bolsa ficou fechada (noite, fim de semana);
 * - durante: no diário/semanal/mensal, a notícia saiu com o candle em andamento, então a variação inclui o que veio antes.
 */
export type Caveat = 'gap' | 'durante' | null;
export type Reaction = { refTime: number; firstTime: number | null; trend: 'alta' | 'baixa' | null; moves: Move[]; caveat: Caveat };

const isLong = (tf: Timeframe) => tf === '1d' || tf === '1wk' || tf === '1mo';

/** Quando o candle começou a negociar. Na B3, os de dia/semana/mês começam na abertura (10h de Brasília = 13h UTC). */
export const openTime = (c: Candle, tf: Timeframe, market: string) =>
  market === 'b3' && isLong(tf) ? Math.floor(c.time / 86400) * 86400 + 13 * 3600 : c.time;

/** Quando o candle fechou. Na B3, os candles de dia/semana/mês fecham no fim do pregão (~18h de Brasília = 21h UTC). */
export function closeTime(c: Candle, tf: Timeframe, market: string): number {
  if (market === 'b3' && (tf === '1d' || tf === '1wk' || tf === '1mo'))
    return Math.floor(c.time / 86400) * 86400 + (tf === '1d' ? 0 : tf === '1wk' ? 4 : 27) * 86400 + 21 * 3600;
  return c.time + PERIOD_S[tf];
}

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * Referência = último candle já fechado quando a notícia saiu; a reação é medida a partir do fechamento dele.
 * Retorna null se a notícia é anterior ao histórico disponível.
 */
export function reactionFor(candles: Candle[], tf: Timeframe, market: string, publishedAt: number, dateOnly = false): Reaction | null {
  let ref = -1;
  for (let i = candles.length - 1; i >= 0; i--) if (closeTime(candles[i], tf, market) <= publishedAt) { ref = i; break; }
  if (ref < 0) return null;
  const close = candles.map((c) => c.close);
  const first = candles[ref + 1];
  // intervalo grande entre candles seguidos = bolsa fechada (4 h de folga para não confundir com minuto sem negócio)
  const caveat: Caveat = !first ? null
    : !isLong(tf) ? (first.time - candles[ref].time > Math.max(2 * PERIOD_S[tf], 4 * 3600) ? 'gap' : null)
    : !dateOnly && publishedAt > openTime(first, tf, market) ? 'durante' : null; // sem hora (CVM) não dá para saber
  const moves: Move[] = [];
  for (const h of NEWS_HORIZONS) {
    if (ref + h >= candles.length) continue;
    const pct = (close[ref + h] / close[ref] - 1) * 100;
    const normal: number[] = [];
    for (let i = Math.max(0, ref - BASELINE); i + h <= ref; i++) normal.push(Math.abs(close[i + h] / close[i] - 1) * 100);
    const typical = normal.length >= 10 ? median(normal) : 0;
    moves.push({ h, pct, times: caveat !== 'gap' && typical > 0 ? Math.abs(pct) / typical : null });
  }
  const avg = sma(close.slice(0, ref + 1), 20).at(-1);
  return { refTime: candles[ref].time, firstTime: candles[ref + 1]?.time ?? null, trend: avg == null ? null : close[ref] >= avg ? 'alta' : 'baixa', moves, caveat };
}

export type CategoryStat = { category: string; events: number; avgPct: number; avgTimes: number | null; up: number };

/** Média por assunto no candle seguinte. Várias notícias sobre o mesmo candle contam como um evento só; reações com ressalva ficam de fora. */
export function statsByCategory(items: { category: string; reaction: Reaction | null }[]): CategoryStat[] {
  const groups = new Map<string, Map<number, Move>>();
  for (const it of items) {
    const m = it.reaction?.moves.find((x) => x.h === 1);
    if (!m || it.reaction!.caveat) continue;
    if (!groups.has(it.category)) groups.set(it.category, new Map());
    groups.get(it.category)!.set(it.reaction!.refTime, m);
  }
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  return [...groups].map(([category, ev]) => {
    const ms = [...ev.values()], times = ms.flatMap((m) => (m.times == null ? [] : [m.times]));
    return { category, events: ms.length, avgPct: mean(ms.map((m) => m.pct)), avgTimes: times.length ? mean(times) : null, up: ms.filter((m) => m.pct > 0).length };
  }).sort((a, b) => b.events - a.events);
}
