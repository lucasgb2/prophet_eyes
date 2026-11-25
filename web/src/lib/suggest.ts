import { INDICATORS, INDICATOR_IDS, type IndicatorId } from './indicators';
import type { Candle } from './types';

export type Suggestion = { id: IndicatorId; label: string; signals: number; hitRate: number; avgReturnPct: number; score: number };

/**
 * Ranking empírico: para cada indicador, olha os sinais históricos NESTE ativo e timeframe
 * e mede o retorno `horizon` candles depois (na direção do sinal).
 * Isso descreve o passado; não é garantia de resultado futuro nem recomendação de investimento.
 */
export function suggestIndicators(candles: Candle[], horizon = 5, minSignals = 5): Suggestion[] {
  const out: Suggestion[] = [];
  for (const id of INDICATOR_IDS) {
    const sig = INDICATORS[id].signals(candles);
    const rets: number[] = [];
    for (let i = 0; i < candles.length - horizon; i++) {
      if (sig[i] === 0) continue;
      rets.push(sig[i] * ((candles[i + horizon].close - candles[i].close) / candles[i].close));
    }
    if (rets.length < minSignals) continue;
    const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
    const hit = rets.filter((r) => r > 0).length / rets.length;
    // score simples: acerto acima de 50% ponderado pelo retorno médio, com penalidade para amostra pequena
    const score = (hit - 0.5) * 100 + avg * 100 * 2 - 10 / Math.sqrt(rets.length);
    out.push({ id, label: INDICATORS[id].label, signals: rets.length, hitRate: hit, avgReturnPct: avg * 100, score });
  }
  return out.sort((a, b) => b.score - a.score);
}
