import { INDICATORS, INDICATOR_IDS, type IndicatorId } from './indicators';
import type { Candle } from './types';

export type SellStats = {
  signals: number;
  /** Fração das vendas em que o preço caiu depois, e a mesma fração em um candle qualquer. */
  fallRate: number; baseFallRate: number;
};

export type Suggestion = {
  id: IndicatorId; label: string;
  /** Só sinais de COMPRA entram no ranking. */
  signals: number; hitRate: number; avgReturnPct: number;
  /** Régua: o mesmo cálculo comprando em um candle qualquer deste histórico. */
  baseHitRate: number; baseAvgPct: number;
  /** Retorno do indicador menos o da régua (pontos percentuais). */
  edgePct: number; score: number;
  /** Vantagem sobre a régua em cada metade do histórico: serve para ver se o resultado se sustenta. */
  edgeFirstPct: number | null; edgeSecondPct: number | null; stable: boolean;
  /** Sinais de venda, avaliados à parte (aviso de saída); null com menos de 5. */
  sell: SellStats | null;
};

export const HORIZONS = [3, 5, 10];   // candles à frente
export const COST = 0.001;            // 0,1% por operação (ida e volta), descontado de cada compra

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const share = (a: number[], ok: (x: number) => boolean) => mean(a.map((x) => (ok(x) ? 1 : 0)));

/** Mede os sinais de um indicador (1 compra, -1 venda) contra a régua. null = menos compras que o mínimo. */
export function evaluate(candles: Candle[], sig: number[], minSignals = 5): Omit<Suggestion, 'id' | 'label'> | null {
  const end = candles.length - Math.max(...HORIZONS);
  const all = Array.from({ length: Math.max(0, end) }, (_, i) => i);
  const buys = all.filter((i) => sig[i] > 0), sells = all.filter((i) => sig[i] < 0);
  if (buys.length < minSignals) return null;
  // o sinal só existe no fechamento do candle i: a entrada é na abertura do seguinte
  const move = (i: number, h: number) => candles[i + h].close / candles[i + 1].open - 1;
  const stats = (idx: number[], h: number) => {
    const r = idx.map((i) => move(i, h) - COST);
    return { avg: mean(r), hit: share(r, (x) => x > 0) };
  };
  const score = mean(HORIZONS.map((h) => {
    const s = stats(buys, h), base = stats(all, h);
    return (s.hit - base.hit) * 100 + (s.avg - base.avg) * 100 * 2;
  })) - 25 / Math.sqrt(buys.length);
  const main = stats(buys, 5), base = stats(all, 5);
  const mid = candles.length / 2;
  const half = (first: boolean) => {
    const inHalf = (i: number) => (i < mid) === first;
    const mine = buys.filter(inHalf);
    // só julga com amostra mínima na metade
    return mine.length >= 3 ? (stats(mine, 5).avg - stats(all.filter(inHalf), 5).avg) * 100 : null;
  };
  const a = half(true), b = half(false);
  const stable = a == null || b == null || (a > 0) === (b > 0);
  const fell = (idx: number[]) => share(idx.map((i) => move(i, 5)), (x) => x < 0);
  return {
    signals: buys.length, hitRate: main.hit, avgReturnPct: main.avg * 100, baseHitRate: base.hit, baseAvgPct: base.avg * 100,
    edgePct: (main.avg - base.avg) * 100, score: score - (stable ? 0 : 8), edgeFirstPct: a, edgeSecondPct: b, stable,
    sell: sells.length >= minSignals ? { signals: sells.length, fallRate: fell(sells), baseFallRate: fell(all) } : null,
  };
}

/**
 * Ranking empírico dos sinais de compra NESTE ativo e timeframe, em vários horizontes (3, 5 e 10 candles),
 * já descontado o custo. Números exibidos são do horizonte de 5 candles. A nota mede quanto o indicador superou
 * a régua (comprar em um candle qualquer) e é penalizada com poucos sinais ou quando a vantagem de uma metade
 * do histórico não aparece na outra. Descreve o passado; não é garantia nem recomendação de investimento.
 */
export function suggestIndicators(candles: Candle[], minSignals = 5): Suggestion[] {
  const out: Suggestion[] = [];
  for (const id of INDICATOR_IDS) {
    const r = evaluate(candles, INDICATORS[id].signals(candles), minSignals);
    if (r) out.push({ id, label: INDICATORS[id].label, ...r });
  }
  return out.sort((a, b) => b.score - a.score);
}
