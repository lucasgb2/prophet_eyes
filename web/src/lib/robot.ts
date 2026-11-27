/** Robô de teste: opera sozinho os sinais de um indicador, sem dinheiro. Funções puras. */
import { COST } from './suggest';
import type { Candle, Timeframe } from './types';
import type { MarketId } from './markets';
import type { IndicatorId } from './indicators';

export type RobotConfig = {
  capital: number; stopPct: number | null; gainPct: number | null;
  /** Menor passo de quantidade (1 ação na B3, 0,00001 em cripto). */
  step: number;
};

export type RobotTrade = {
  entryTime: number; entryPrice: number; qty: number;
  exitTime: number; exitPrice: number; reason: string; money: number; pct: number;
};

export type RobotState = {
  cash: number;
  position: { entryTime: number; entryPrice: number; qty: number } | null;
  /** Sinal de um candle já fechado: executa na abertura do próximo. */
  pending: 'buy' | 'sell' | null;
  /** Último candle fechado já processado. */
  lastClosed: number;
  /** Abertura do primeiro candle depois da criação: base do "comprar e segurar". */
  firstPrice: number | null;
  lastPrice: number | null;
  trades: RobotTrade[];
  peak: number; maxDrawdownPct: number;
  /** [candle, patrimônio do robô, patrimônio comprando e segurando] */
  curve: [number, number, number][];
};

export type RobotEvent = { type: 'buy'; price: number; qty: number } | { type: 'sell'; trade: RobotTrade };

export type Robot = {
  id: number; market: MarketId; env: 'production' | 'testnet'; symbol: string; timeframe: Timeframe; indicator: IndicatorId;
  capital: number; stopPct: number | null; gainPct: number | null; status: 'running' | 'stopped';
  state: RobotState; createdAt: number; stoppedAt: number | null;
};

export const MAX_TRADES = 500;
const MAX_CURVE = 500;

export const initialState = (capital: number, lastClosed: number): RobotState =>
  ({ cash: capital, position: null, pending: null, lastClosed, firstPrice: null, lastPrice: null, trades: [], peak: capital, maxDrawdownPct: 0, curve: [] });

export const equity = (s: RobotState) => s.cash + (s.position && s.lastPrice != null ? s.position.qty * s.lastPrice : 0);
export const holdValue = (s: RobotState, capital: number) => (s.firstPrice && s.lastPrice != null ? capital * (s.lastPrice / s.firstPrice - COST) : capital);

function sell(s: RobotState, time: number, price: number, reason: string): RobotTrade {
  const p = s.position!;
  // custo de ida e volta cobrado na saída sobre o valor de entrada (mesma conta do diário)
  const fee = p.qty * p.entryPrice * COST;
  const money = p.qty * (price - p.entryPrice) - fee;
  const trade = { ...p, exitTime: time, exitPrice: price, reason, money, pct: (price / p.entryPrice - 1 - COST) * 100 };
  s.cash += p.qty * price - fee;
  s.position = null;
  s.trades = [...s.trades, trade].slice(-MAX_TRADES);
  return trade;
}

/**
 * Processa os candles posteriores ao último fechado. `closed` = quantos candles do início já fecharam: só eles dão
 * sinal. A ordem sai na abertura do candle seguinte; stop loss é conferido antes do stop gain. Chamar de novo com o
 * mesmo candle em formação não repete nada. Todo o saldo entra em cada compra.
 */
export function advance(prev: RobotState, candles: Candle[], closed: number, sig: number[], cfg: RobotConfig): { state: RobotState; events: RobotEvent[] } {
  const s: RobotState = { ...prev, curve: [...prev.curve] };
  const events: RobotEvent[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (c.time <= s.lastClosed) continue;
    s.firstPrice ??= c.open;
    s.lastPrice = c.close;
    if (s.pending === 'buy' && !s.position) {
      const qty = Number((Math.floor(s.cash / (c.open * (1 + COST)) / cfg.step + 1e-9) * cfg.step).toFixed(8));
      if (qty > 0) {
        s.position = { entryTime: c.time, entryPrice: c.open, qty };
        s.cash -= qty * c.open;
        events.push({ type: 'buy', price: c.open, qty });
      }
    } else if (s.pending === 'sell' && s.position) events.push({ type: 'sell', trade: sell(s, c.time, c.open, 'sinal de venda') });
    s.pending = null;

    if (s.position) {
      const stop = cfg.stopPct ? s.position.entryPrice * (1 - cfg.stopPct / 100) : null;
      const gain = cfg.gainPct ? s.position.entryPrice * (1 + cfg.gainPct / 100) : null;
      if (stop != null && c.low <= stop) events.push({ type: 'sell', trade: sell(s, c.time, Math.min(c.open, stop), 'stop loss') });
      else if (gain != null && c.high >= gain) events.push({ type: 'sell', trade: sell(s, c.time, Math.max(c.open, gain), 'stop gain') });
    }

    if (i >= closed) break;
    if (sig[i] > 0 && !s.position) s.pending = 'buy';
    else if (sig[i] < 0 && s.position) s.pending = 'sell';
    s.lastClosed = c.time;
    const eq = equity(s);
    s.peak = Math.max(s.peak, eq);
    s.maxDrawdownPct = Math.max(s.maxDrawdownPct, (1 - eq / s.peak) * 100);
    s.curve.push([c.time, eq, holdValue(s, cfg.capital)]);
    if (s.curve.length > MAX_CURVE) s.curve.shift();
  }
  return { state: s, events };
}

/** Parar: vende o que estiver comprado pelo último preço conhecido. */
export function stopRobot(prev: RobotState, time: number): RobotState {
  const s: RobotState = { ...prev, pending: null };
  if (s.position && s.lastPrice != null) sell(s, time, s.lastPrice, 'robô parado');
  return s;
}
