import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, equity, holdValue, initialState, stopRobot, type RobotConfig } from './robot';
import type { Candle } from './types';

const c = (i: number, open: number, close = open, high = Math.max(open, close), low = Math.min(open, close)): Candle => ({ time: i, open, close, high, low, volume: 1 });
const cfg: RobotConfig = { capital: 1000, stopPct: null, gainPct: null, step: 1 };
const k = [c(1, 10), c(2, 10), c(3, 10), c(4, 12), c(5, 12), c(6, 11), c(7, 11)];
const sig = [1, 1, 0, -1, 0, 1, 0]; // o sinal do candle 1 é anterior à criação
const run = (upTo = k.length, closed = upTo, from = initialState(1000, 1), over: Partial<RobotConfig> = {}, candles = k) => advance(from, candles.slice(0, upTo), closed, sig, { ...cfg, ...over });

test('compra e vende na abertura seguinte ao sinal, usando o saldo todo e reinvestindo', () => {
  const { state, events } = run();
  const [t] = state.trades;
  assert.deepEqual([t.entryTime, t.entryPrice, t.qty, t.exitTime, t.exitPrice, t.reason], [3, 10, 99, 5, 12, 'sinal de venda']);
  assert.deepEqual(events.map((e) => e.type), ['buy', 'sell', 'buy']); // nada expira: voltou a comprar
  assert.equal(state.position!.entryTime, 7);
  assert.ok(Math.abs(equity(state) - (1000 + t.money)) < 1e-9);
  assert.ok(Math.abs(holdValue(state, 1000) - 1000 * (11 / 10 - 0.001)) < 1e-9);
});
test('avançar aos poucos dá o mesmo resultado, e candle em formação não repete ordem', () => {
  let s = initialState(1000, 1), n = 0;
  for (let upTo = 2; upTo <= k.length; upTo++) {
    for (let again = 0; again < 2; again++) { const r = run(upTo, upTo - 1, s); s = r.state; n += r.events.length; }
  }
  const all = run(k.length, k.length - 1).state;
  assert.equal(n, 3); assert.deepEqual([s.cash, s.position, s.trades], [all.cash, all.position, all.trades]);
});
test('stop loss e stop gain em %, com o loss primeiro e gap na abertura', () => {
  const both = [...k]; both[2] = c(3, 10, 10, 12, 8);
  assert.equal(run(3, 3, undefined, { stopPct: 5, gainPct: 5 }, both).state.trades[0].reason, 'stop loss');
  const gap = [...k]; gap[3] = c(4, 8);
  assert.equal(run(4, 4, undefined, { stopPct: 5 }, gap).state.trades[0].exitPrice, 8);
  assert.equal(run(4, 4, undefined, { gainPct: 10 }).state.trades[0].reason, 'stop gain');
});
test('parar vende pelo último preço; saldo pequeno não compra', () => {
  const s = stopRobot(run(3).state, 9);
  assert.equal(s.position, null); assert.equal(s.trades[0].reason, 'robô parado');
  assert.equal(run(3, 3, initialState(5, 1)).events.length, 0);
});
