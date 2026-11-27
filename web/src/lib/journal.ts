/** Diário de operações e teste de mesa. Funções puras. */
import { planPosition } from './risk';
import { COST } from './suggest';
import { PERIOD_S } from './next-candle';
import type { Candle, Timeframe } from './types';
import type { MarketId } from './markets';

export const WAIT_CANDLES = 10; // sem compra em tantos candles fechados, o cenário expira
export const HOLD_CANDLES = 5;  // saída "após 5 candles": o mesmo prazo dos cartões do ranking

export type Status = 'waiting' | 'open' | 'closed' | 'expired' | 'cancelled';
export type ExitRule = 'signal' | 'bars';

export type Setup = {
  /** Último candle já fechado quando o cenário foi criado: só valem sinais depois dele. */
  refTime: number;
  stopLoss: number; stopGain: number | null; exitRule: ExitRule;
  capital: number; riskPct: number; step: number;
};

export type Progress = {
  status: Status; reason: string | null;
  signalTime: number | null; entryTime: number | null; entryPrice: number | null; qty: number | null;
  exitTime: number | null; exitPrice: number | null;
};

export type Entry = Progress & {
  id: number; kind: 'test' | 'real'; market: MarketId; env: 'production' | 'testnet'; symbol: string; timeframe: Timeframe | null;
  indicator: string | null; exitRule: ExitRule | null; stopLoss: number | null; stopGain: number | null;
  capital: number | null; riskPct: number | null; note: string | null; lastPrice: number | null; createdAt: number;
};

/** Quantos candles do início da lista já fecharam (o último pode estar em formação). */
export function closedCount(candles: Candle[], tf: Timeframe, market: MarketId, nowS = Date.now() / 1000): number {
  const last = candles.at(-1);
  if (!last) return 0;
  // diário da B3 é carimbado à 00:00 de Brasília e fecha às 18:50
  const end = market === 'b3' && tf === '1d' ? last.time + (18 * 60 + 50) * 60 : last.time + PERIOD_S[tf];
  return nowS >= end ? candles.length : candles.length - 1;
}

/**
 * Onde o cenário está, recalculado a partir dos candles. `sig` são os sinais do indicador (1 compra, -1 venda);
 * sinais só valem em candle fechado. Entrada na abertura do candle seguinte à compra. Saída no que vier primeiro:
 * stop loss, stop gain, ou a regra escolhida. Stop loss e stop gain no mesmo candle: conta o stop loss.
 */
export function track(candles: Candle[], closed: number, sig: number[], s: Setup): Progress {
  const p: Progress = { status: 'waiting', reason: null, signalTime: null, entryTime: null, entryPrice: null, qty: null, exitTime: null, exitPrice: null };
  const start = candles.findIndex((c) => c.time > s.refTime);
  if (start < 0) return p;
  const end = Math.min(closed, start + WAIT_CANDLES);
  let at = start;
  while (at < end && !(sig[at] > 0)) at++;
  if (at >= end) return end - start >= WAIT_CANDLES ? { ...p, status: 'expired', reason: `sem compra em ${WAIT_CANDLES} candles` } : p;
  p.signalTime = candles[at].time;
  const first = candles[at + 1];
  if (!first) return p;
  const cancel = (reason: string): Progress => ({ ...p, status: 'cancelled', reason });
  if (first.open <= s.stopLoss) return cancel('abriu abaixo do stop loss');
  if (s.stopGain != null && first.open >= s.stopGain) return cancel('abriu acima do stop gain');
  const plan = planPosition({ capital: s.capital, riskPct: s.riskPct, entry: first.open, stop: s.stopLoss, step: s.step, cost: COST });
  if (!plan?.qty) return cancel('o risco não paga a quantidade mínima');
  Object.assign(p, { status: 'open', entryTime: first.time, entryPrice: first.open, qty: plan.qty });

  const out = (c: Candle, price: number, reason: string): Progress => ({ ...p, status: 'closed', exitTime: c.time, exitPrice: price, reason });
  for (let i = at + 1; i < candles.length; i++) {
    const c = candles[i];
    if (c.low <= s.stopLoss) return out(c, Math.min(c.open, s.stopLoss), 'stop loss');
    if (s.stopGain != null && c.high >= s.stopGain) return out(c, Math.max(c.open, s.stopGain), 'stop gain');
    if (i >= closed) break;
    if (s.exitRule === 'bars' && i === at + HOLD_CANDLES) return out(c, c.close, `após ${HOLD_CANDLES} candles`);
    const next = candles[i + 1];
    if (s.exitRule === 'signal' && sig[i] < 0 && next) return out(next, next.open, 'sinal de venda');
  }
  return p;
}

/** Resultado em dinheiro e em %, já com o custo. Em aberto usa o último preço. */
export function resultOf(e: Pick<Entry, 'entryPrice' | 'exitPrice' | 'lastPrice' | 'qty' | 'status'>): { money: number; pct: number } | null {
  const exit = e.status === 'closed' ? e.exitPrice : e.status === 'open' ? e.lastPrice : null;
  if (exit == null || !e.entryPrice || !e.qty) return null;
  return { money: e.qty * (exit - e.entryPrice) - e.qty * e.entryPrice * COST, pct: (exit / e.entryPrice - 1 - COST) * 100 };
}
