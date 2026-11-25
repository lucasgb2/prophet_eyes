import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, DEFAULT_OPTS } from './backtest';

// candle com open/close/high/low controlados
const bar = (i: number, o: number, h: number, l: number, c: number) => ({ time: 1_700_000_000 + i * 86400, open: o, high: h, low: l, close: c, volume: 1 });
const F = (n: number) => new Array(n).fill(false);
const opts = { ...DEFAULT_OPTS, costPct: 0 };

test('entra na abertura do candle seguinte ao sinal e sai na abertura seguinte ao sinal de venda', () => {
  const c = [bar(0, 10, 10, 10, 10), bar(1, 11, 12, 11, 12), bar(2, 12, 13, 12, 13), bar(3, 14, 14, 14, 14), bar(4, 15, 15, 15, 15)];
  const buy = F(5), sell = F(5); buy[0] = true; sell[2] = true;
  const r = simulate(c, buy, sell, opts);
  assert.equal(r.n, 1);
  assert.equal(r.trades[0].entryPrice, 11);  // abertura do candle 1, não o fechamento do 0
  assert.equal(r.trades[0].exitPrice, 14);   // abertura do candle 3
  assert.ok(Math.abs(r.trades[0].retPct - (14 / 11 - 1) * 100) < 1e-9);
  assert.equal(r.trades[0].reason, 'sinal contrário');
});
test('stop dentro do candle usa o pior preço em caso de gap', () => {
  const c = [bar(0, 10, 10, 10, 10), bar(1, 10, 10, 10, 10), bar(2, 8, 8.5, 7.5, 8)]; // abre abaixo do stop de 5%
  const buy = F(3); buy[0] = true;
  const r = simulate(c, buy, F(3), { ...opts, stopPct: 5 });
  assert.equal(r.trades[0].reason, 'stop');
  assert.equal(r.trades[0].exitPrice, 8);
});
test('stop e alvo no mesmo candle: vale o stop (conservador)', () => {
  const c = [bar(0, 10, 10, 10, 10), bar(1, 10, 12, 9, 10)];
  const buy = F(2); buy[0] = true;
  const r = simulate(c, buy, F(2), { ...opts, stopPct: 5, targetPct: 10 });
  assert.equal(r.trades[0].reason, 'stop');
});
test('saída por tempo e custo descontado', () => {
  const c = Array.from({ length: 8 }, (_, i) => bar(i, 10, 10, 10, 10));
  const buy = F(8); buy[0] = true;
  const r = simulate(c, buy, F(8), { ...opts, exit: 'bars', bars: 3, costPct: 0.1 });
  assert.equal(r.trades[0].reason, 'tempo');
  assert.equal(r.trades[0].bars, 3);
  assert.ok(Math.abs(r.trades[0].retPct + 0.1) < 1e-9);
});
test('posição aberta no fim é marcada a mercado', () => {
  const c = [bar(0, 10, 10, 10, 10), bar(1, 10, 10, 10, 10), bar(2, 10, 12, 10, 12)];
  const buy = F(3); buy[0] = true;
  const r = simulate(c, buy, F(3), opts);
  assert.equal(r.trades[0].open, true);
  assert.equal(r.trades[0].exitPrice, 12);
  assert.ok(r.totalReturnPct > 19.9 && r.totalReturnPct < 20.1);
});
test('sem sinais: nenhuma operação e capital constante', () => {
  const c = [bar(0, 10, 10, 10, 10), bar(1, 11, 11, 11, 11)];
  const r = simulate(c, F(2), F(2), opts);
  assert.equal(r.n, 0); assert.equal(r.totalReturnPct, 0); assert.equal(r.maxDrawdownPct, 0);
});
test('drawdown máximo e taxa de acerto', () => {
  // ganha 10%, depois perde 20%
  const c = [bar(0, 10, 10, 10, 10), bar(1, 10, 11, 10, 11), bar(2, 11, 11, 11, 11), bar(3, 10, 10, 10, 10), bar(4, 10, 10, 8, 8), bar(5, 8, 8, 8, 8)];
  const buy = F(6), sell = F(6); buy[0] = true; sell[1] = true; buy[2] = true; sell[4] = true;
  const r = simulate(c, buy, sell, opts);
  assert.equal(r.n, 2);
  assert.equal(r.winRate, 0.5);
  assert.ok(r.maxDrawdownPct > 0);
});
