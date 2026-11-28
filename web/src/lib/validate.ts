/**
 * Teste fora da amostra: escolhe o indicador olhando só o passado de cada janela e mede no trecho seguinte,
 * que a escolha não viu. Usa o mesmo motor do robô (lib/robot). Funções puras.
 */
import { advance, initialState, stopRobot, equity, type RobotTrade } from './robot';
import { COST } from './suggest';
import { INDICATORS, INDICATOR_IDS, type IndicatorId } from './indicators';
import type { Candle } from './types';

export const WARMUP = 200;      // candles só para as médias longas existirem
export const TRAIN = 504;       // cerca de 2 anos no diário
export const TEST = 126;        // cerca de 6 meses no diário
export const MIN_TRADES = 3;    // menos que isso no período de escolha é sorte demais
const MIN_USABLE = 240;
const CAPITAL = 100;

export type Rules = { stopPct: number | null; gainPct: number | null; slipPct: number };

export type Run = { returnPct: number; drawdownPct: number; trades: RobotTrade[] };

/** Roda o robô nos candles [from, to). Começa fora do mercado; o que sobrar comprado é vendido no último fechamento. */
export function run(candles: Candle[], sig: number[], from: number, to: number, rules: Rules): Run {
  const cfg = { capital: CAPITAL, step: 1e-8, ...rules };
  const start = initialState(CAPITAL, candles[from - 1]?.time ?? candles[from].time - 1);
  const { state } = advance(start, candles.slice(0, to), to, sig, cfg);
  const last = candles[to - 1];
  const end = state.position ? stopRobot({ ...state, lastPrice: last.close * (1 - rules.slipPct / 100) }, last.time) : state;
  const value = equity(end);
  // a venda final também pode ser o fundo da maior queda
  const drawdownPct = Math.max(state.maxDrawdownPct, (1 - value / Math.max(state.peak, value)) * 100);
  return { returnPct: (value / CAPITAL - 1) * 100, drawdownPct, trades: end.trades };
}

/** Comprar na primeira abertura e segurar até o último fechamento do trecho. */
export function hold(candles: Candle[], from: number, to: number): { returnPct: number; drawdownPct: number } {
  const entry = candles[from].open;
  let peak = entry, drawdownPct = 0;
  for (let i = from; i < to; i++) {
    peak = Math.max(peak, candles[i].close);
    drawdownPct = Math.max(drawdownPct, (1 - candles[i].close / peak) * 100);
  }
  return { returnPct: (candles[to - 1].close / entry - 1 - COST) * 100, drawdownPct };
}

export type Window = {
  from: number; to: number;
  /** null = nenhum indicador deu resultado positivo no período de escolha: fica de fora. */
  chosen: IndicatorId | null; trainPct: number | null; testPct: number; holdPct: number;
};

export type Stats = {
  returnPct: number; drawdownPct: number; trades: number; winRate: number | null; avgTradePct: number | null; worstStreak: number;
};

export type Row = Stats & { id: IndicatorId; label: string; beatWindows: number };

export type Report = {
  from: number; to: number; train: number; test: number;
  windows: Window[];
  chosen: Stats;
  hold: { returnPct: number; drawdownPct: number };
  rows: Row[];
};

/** Junta janelas consecutivas: o resultado compõe, e a maior queda considera o que já foi acumulado. */
function chain(runs: Run[]): Stats {
  let value = 1, peak = 1, dd = 0, streak = 0, worstStreak = 0;
  for (const r of runs) {
    const low = value * (1 - r.drawdownPct / 100); // aproximação por baixo do pior ponto da janela
    dd = Math.max(dd, r.drawdownPct, (1 - low / peak) * 100);
    value *= 1 + r.returnPct / 100;
    peak = Math.max(peak, value);
  }
  const trades = runs.flatMap((r) => r.trades);
  for (const t of trades) { streak = t.money > 0 ? 0 : streak + 1; worstStreak = Math.max(worstStreak, streak); }
  return {
    returnPct: (value - 1) * 100, drawdownPct: dd, trades: trades.length,
    winRate: trades.length ? trades.filter((t) => t.money > 0).length / trades.length : null,
    avgTradePct: trades.length ? trades.reduce((a, t) => a + t.pct, 0) / trades.length : null,
    worstStreak,
  };
}

/** `candles`: só os fechados, em ordem. Devolve null se o histórico não dá nem para três janelas. */
export function walkForward(candles: Candle[], rules: Rules): Report | null {
  const usable = candles.length - WARMUP;
  if (usable < MIN_USABLE) return null;
  const full = usable >= TRAIN + 3 * TEST;
  const train = full ? TRAIN : Math.floor(usable / 2), test = full ? TEST : Math.floor(usable / 8);
  const sigs = INDICATOR_IDS.map((id) => ({ id, sig: INDICATORS[id].signals(candles) }));

  // as janelas terminam no candle mais recente
  const count = Math.floor((candles.length - WARMUP - train) / test);
  const first = candles.length - count * test;
  const windows: Window[] = [], picked: Run[] = [];
  const each = new Map<IndicatorId, Run[]>(sigs.map((s) => [s.id, []]));
  const beat = new Map<IndicatorId, number>(sigs.map((s) => [s.id, 0]));

  for (let from = first; from < candles.length; from += test) {
    const to = from + test, holdPct = hold(candles, from, to).returnPct;
    let best: { id: IndicatorId; sig: number[]; returnPct: number } | null = null;
    const results = new Map<IndicatorId, Run>();
    for (const s of sigs) {
      const past = run(candles, s.sig, from - train, from, rules);
      if (past.trades.length >= MIN_TRADES && past.returnPct > 0 && (!best || past.returnPct > best.returnPct)) best = { id: s.id, sig: s.sig, returnPct: past.returnPct };
      const next = run(candles, s.sig, from, to, rules);
      results.set(s.id, next);
      each.get(s.id)!.push(next);
      if (next.returnPct > holdPct) beat.set(s.id, beat.get(s.id)! + 1);
    }
    const next = best ? results.get(best.id)! : { returnPct: 0, drawdownPct: 0, trades: [] };
    picked.push(next);
    windows.push({ from: candles[from].time, to: candles[to - 1].time, chosen: best?.id ?? null, trainPct: best?.returnPct ?? null, testPct: next.returnPct, holdPct });
  }

  return {
    from: candles[first].time, to: candles.at(-1)!.time, train, test, windows,
    chosen: chain(picked),
    hold: hold(candles, first, candles.length),
    rows: sigs.map((s) => ({ id: s.id, label: INDICATORS[s.id].label, ...chain(each.get(s.id)!), beatWindows: beat.get(s.id)! }))
      .sort((a, b) => b.returnPct - a.returnPct),
  };
}
