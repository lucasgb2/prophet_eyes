import { INDICATORS, type IndicatorId } from './indicators';
import type { Candle } from './types';

export type BacktestOpts = {
  ids: IndicatorId[];
  /** 'any': qualquer indicador dando compra entra; 'all': todos precisam ter dado compra nos últimos `window` candles. */
  mode: 'any' | 'all';
  window: number;
  /** 'opposite': sai no sinal de venda de qualquer indicador; 'bars': sai após N candles. Stop e alvo valem nos dois. */
  exit: 'opposite' | 'bars';
  bars: number;
  stopPct: number | null;   // ex.: 5 = 5% abaixo da entrada
  targetPct: number | null;
  costPct: number;          // custo por operação completa (ida e volta), em %
};

export const DEFAULT_OPTS: BacktestOpts = { ids: [], mode: 'any', window: 3, exit: 'opposite', bars: 10, stopPct: null, targetPct: null, costPct: 0.1 };

export type Trade = {
  entryIdx: number; exitIdx: number; entryTime: number; exitTime: number;
  entryPrice: number; exitPrice: number; retPct: number; bars: number;
  reason: 'sinal contrário' | 'tempo' | 'stop' | 'alvo' | 'em aberto'; open: boolean;
};

export type Stats = { n: number; winRate: number | null; avgRetPct: number | null };
export type Result = {
  trades: Trade[]; equity: number[]; buyHold: number[];
  n: number; winRate: number | null; avgRetPct: number | null; avgWinPct: number | null; avgLossPct: number | null;
  profitFactor: number | null; totalReturnPct: number; buyHoldPct: number; maxDrawdownPct: number; avgBars: number | null; exposurePct: number;
  firstHalf: Stats; secondHalf: Stats;
};

/**
 * Núcleo da simulação (long-only), sem depender dos indicadores:
 * sinal no fechamento do candle i => entrada/saída na ABERTURA do candle i+1 (sem olhar o futuro).
 * Stop e alvo são checados dentro do candle (stop primeiro se os dois forem tocados; gap abre pior preço).
 * Posição aberta no fim é marcada a mercado no último fechamento.
 */
export function simulate(c: Candle[], buy: boolean[], sell: boolean[], o: BacktestOpts): Result {
  const n = c.length, cost = o.costPct / 100;
  const trades: Trade[] = [];
  const equity: number[] = new Array(n).fill(1);
  let eq = 1;                       // capital quando fora do mercado
  let pos: { idx: number; price: number } | null = null;
  let pendingEntry = false, pendingExit: Trade['reason'] | null = null, inMarket = 0;

  const close = (i: number, price: number, reason: Trade['reason'], open = false) => {
    const p = pos!;
    const ret = price / p.price - 1 - cost;
    eq *= 1 + ret;
    trades.push({ entryIdx: p.idx, exitIdx: i, entryTime: c[p.idx].time, exitTime: c[i].time, entryPrice: p.price, exitPrice: price, retPct: ret * 100, bars: i - p.idx + (reason === 'sinal contrário' || reason === 'tempo' ? 0 : 1), reason, open });
    pos = null;
  };

  for (let i = 0; i < n; i++) {
    if (pos && pendingExit) { close(i, c[i].open, pendingExit); pendingExit = null; }
    if (!pos && pendingEntry) { pos = { idx: i, price: c[i].open }; }
    pendingEntry = false;
    if (pos) {
      const stop = o.stopPct ? pos.price * (1 - o.stopPct / 100) : null;
      const target = o.targetPct ? pos.price * (1 + o.targetPct / 100) : null;
      if (stop !== null && c[i].low <= stop) close(i, Math.min(c[i].open, stop), 'stop');
      else if (target !== null && c[i].high >= target) close(i, Math.max(c[i].open, target), 'alvo');
    }
    if (pos) {
      inMarket++;
      if (o.exit === 'opposite' && sell[i]) pendingExit = 'sinal contrário';
      else if (o.exit === 'bars' && i - pos.idx + 1 >= o.bars) pendingExit = 'tempo';
      equity[i] = eq * (c[i].close / pos.price);
    } else {
      equity[i] = eq;
      if (buy[i] && i < n - 1) pendingEntry = true;
    }
  }
  if (pos) { const last = n - 1; close(last, c[last].close, 'em aberto', true); equity[last] = eq; }

  let peak = 1, maxDd = 0;
  for (const v of equity) { peak = Math.max(peak, v); maxDd = Math.max(maxDd, 1 - v / peak); }
  const wins = trades.filter((t) => t.retPct > 0), losses = trades.filter((t) => t.retPct <= 0);
  const avg = (a: Trade[]) => (a.length ? a.reduce((s, t) => s + t.retPct, 0) / a.length : null);
  const sumW = wins.reduce((s, t) => s + t.retPct, 0), sumL = -losses.reduce((s, t) => s + t.retPct, 0);
  const stats = (a: Trade[]): Stats => ({ n: a.length, winRate: a.length ? a.filter((t) => t.retPct > 0).length / a.length : null, avgRetPct: avg(a) });
  const half = n / 2;
  return {
    trades, equity, buyHold: c.map((x) => x.close / c[0].close),
    n: trades.length, winRate: trades.length ? wins.length / trades.length : null, avgRetPct: avg(trades),
    avgWinPct: avg(wins), avgLossPct: avg(losses), profitFactor: sumL > 0 ? sumW / sumL : null,
    totalReturnPct: (eq - 1) * 100, buyHoldPct: n ? (c[n - 1].close / c[0].close - 1) * 100 : 0, maxDrawdownPct: maxDd * 100,
    avgBars: trades.length ? trades.reduce((s, t) => s + t.bars, 0) / trades.length : null,
    exposurePct: n ? (inMarket / n) * 100 : 0,
    firstHalf: stats(trades.filter((t) => t.entryIdx < half)), secondHalf: stats(trades.filter((t) => t.entryIdx >= half)),
  };
}

/** Monta os sinais de entrada/saída a partir dos indicadores escolhidos e roda a simulação. */
export function backtest(c: Candle[], o: BacktestOpts): Result {
  const sigs = o.ids.map((id) => INDICATORS[id].signals(c));
  const n = c.length;
  const buy: boolean[] = new Array(n).fill(false), sell: boolean[] = new Array(n).fill(false);
  if (sigs.length) {
    for (let i = 0; i < n; i++) {
      sell[i] = sigs.some((s) => s[i] < 0);
      if (o.mode === 'any') buy[i] = sigs.some((s) => s[i] > 0);
      else buy[i] = sigs.some((s) => s[i] > 0) && sigs.every((s) => { for (let k = Math.max(0, i - o.window + 1); k <= i; k++) if (s[k] > 0) return true; return false; });
    }
  }
  return simulate(c, buy, sell, o);
}
