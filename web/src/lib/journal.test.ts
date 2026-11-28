import test from 'node:test';
import assert from 'node:assert/strict';
import { closedCount, resultOf, track, type Setup } from './journal';
import type { Candle } from './types';

const c = (i: number, open: number, high = open + 1, low = open - 1, close = open): Candle => ({ time: i * 86400, open, high, low, close, volume: 1 });
const flat = (n: number) => Array.from({ length: n }, (_, i) => c(i, 40));
const sig = (n: number, m: Record<number, number>) => Array.from({ length: n }, (_, i) => m[i] ?? 0);
const setup: Setup = { refTime: 2 * 86400, stopLoss: 38, stopGain: 46, exitRule: 'signal', capital: 10000, riskPct: 1, step: 1 };
const run = (candles: Candle[], s: Record<number, number>, over: Partial<Setup> = {}, closed = candles.length) => track(candles, closed, sig(candles.length, s), { ...setup, ...over });

test('espera o sinal depois da criação e expira após 10 candles', () => {
  assert.equal(run(flat(6), { 1: 1 }).status, 'waiting'); // sinal antigo não vale
  assert.equal(run(flat(13), {}).status, 'expired');
  assert.equal(run(flat(5), { 4: 1 }, {}, 4).status, 'waiting'); // candle em formação não dá sinal
});
test('entra na abertura seguinte, com a quantidade pelo preço real, e sai no sinal de venda', () => {
  const k = flat(8); k[4] = c(4, 40.5); k[7] = c(7, 42);
  const p = run(k, { 3: 1, 6: -1 });
  assert.equal(p.status, 'closed'); assert.equal(p.entryPrice, 40.5); assert.equal(p.qty, 39);
  assert.equal(p.exitPrice, 42); assert.equal(p.reason, 'sinal de venda');
  assert.ok(resultOf({ ...p, lastPrice: null })!.money > 0);
});
test('stop loss vale antes do stop gain no mesmo candle, e gap sai na abertura', () => {
  const k = flat(8); k[5] = c(5, 40, 47, 37);
  assert.deepEqual([run(k, { 3: 1 }).reason, run(k, { 3: 1 }).exitPrice], ['stop loss', 38]);
  k[5] = c(5, 36);
  assert.equal(run(k, { 3: 1 }).exitPrice, 36);
  k[5] = c(5, 40, 47, 39);
  assert.deepEqual([run(k, { 3: 1 }).reason, run(k, { 3: 1 }).exitPrice], ['stop gain', 46]);
});
test('abertura fora dos stops cancela', () => {
  const k = flat(6); k[4] = c(4, 37);
  assert.equal(run(k, { 3: 1 }).status, 'cancelled');
  k[4] = c(4, 47);
  assert.equal(run(k, { 3: 1 }).status, 'cancelled');
});
test('saída após 5 candles segue o ranking e ignora o sinal de venda', () => {
  const k = flat(12); k[8] = c(8, 40, 42, 39, 41);
  const p = run(k, { 3: 1, 5: -1 }, { exitRule: 'bars' });
  assert.deepEqual([p.exitPrice, p.exitTime, p.reason], [41, 8 * 86400, 'após 5 candles']);
  assert.equal(run(flat(6), { 3: 1 }, { exitRule: 'bars' }).status, 'open');
});
test('diário da B3 fecha às 18:50 de Brasília; cripto na virada do período', () => {
  const k = [c(0, 1)].map((x) => ({ ...x, time: Date.UTC(2026, 10, 27, 3) / 1000 }));
  assert.equal(closedCount(k, '1d', 'b3', Date.UTC(2026, 10, 27, 20) / 1000), 0);
  assert.equal(closedCount(k, '1d', 'b3', Date.UTC(2026, 10, 27, 22) / 1000), 1);
  assert.equal(closedCount(k, '1d', 'binance', Date.UTC(2026, 10, 27, 22) / 1000), 0);
});
