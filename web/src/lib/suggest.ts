import { INDICATORS, INDICATOR_IDS, type IndicatorId } from './indicators';
import type { Candle } from './types';

export type Suggestion = {
  id: IndicatorId; label: string; signals: number; hitRate: number; avgReturnPct: number; score: number;
  /** Taxa de acerto na 1ª e na 2ª metade do histórico: serve para ver se o resultado se sustenta. */
  hitFirst: number | null; hitSecond: number | null; stable: boolean;
};

export const HORIZONS = [3, 5, 10];   // candles à frente
export const COST = 0.001;            // 0,1% por operação (ida e volta), descontado de cada sinal

/**
 * Ranking empírico: para cada indicador, olha os sinais históricos NESTE ativo e timeframe e mede o retorno
 * em vários horizontes (3, 5 e 10 candles), na direção do sinal e já descontado o custo por operação.
 * Hit/retorno exibidos são do horizonte de 5 candles. A nota usa a média dos três horizontes e é penalizada
 * quando a taxa de acerto da 1ª e a da 2ª metade do histórico divergem (resultado que não se sustenta).
 * Descreve o passado; não é garantia de resultado futuro nem recomendação de investimento.
 */
export function suggestIndicators(candles: Candle[], minSignals = 5): Suggestion[] {
  const out: Suggestion[] = [];
  const maxH = Math.max(...HORIZONS);
  const mid = candles.length / 2;
  for (const id of INDICATOR_IDS) {
    const sig = INDICATORS[id].signals(candles);
    const ret = (i: number, h: number) => sig[i] * ((candles[i + h].close - candles[i].close) / candles[i].close) - COST;
    const idx: number[] = [];
    for (let i = 0; i < candles.length - maxH; i++) if (sig[i] !== 0) idx.push(i);
    if (idx.length < minSignals) continue;
    const stats = (h: number, subset = idx) => {
      const r = subset.map((i) => ret(i, h));
      return { n: r.length, avg: r.reduce((a, b) => a + b, 0) / (r.length || 1), hit: r.length ? r.filter((x) => x > 0).length / r.length : null };
    };
    const score = HORIZONS.reduce((acc, h) => { const s = stats(h); return acc + ((s.hit! - 0.5) * 100 + s.avg * 100 * 2); }, 0) / HORIZONS.length - 25 / Math.sqrt(idx.length);
    const main = stats(5);
    const a = stats(5, idx.filter((i) => i < mid)), b = stats(5, idx.filter((i) => i >= mid));
    // só julga estabilidade com amostra mínima nas duas metades
    const judged = a.n >= 3 && b.n >= 3;
    const stable = !judged || (a.hit! > 0.5) === (b.hit! > 0.5);
    out.push({
      id, label: INDICATORS[id].label, signals: idx.length, hitRate: main.hit!, avgReturnPct: main.avg * 100,
      score: score - (stable ? 0 : 8), hitFirst: a.hit, hitSecond: b.hit, stable,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}
