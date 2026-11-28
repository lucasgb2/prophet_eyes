import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hold, run, walkForward, TEST, TRAIN, WARMUP } from './validate';
import { INDICATORS, INDICATOR_IDS } from './indicators';
import type { Candle } from './types';

// passeio pseudoaleatório reproduzível
function series(n: number, seed = 7): Candle[] {
  let s = seed, close = 100;
  const rnd = () => (s = (s * 48271) % 2147483647) / 2147483647;
  return Array.from({ length: n }, (_, i) => {
    const open = close * (1 + (rnd() - 0.5) * 0.01);
    close = open * (1 + (rnd() - 0.5) * 0.04);
    return { time: (i + 1) * 86400, open, close, high: Math.max(open, close) * (1 + rnd() * 0.01), low: Math.min(open, close) * (1 - rnd() * 0.01), volume: 1000 + Math.floor(rnd() * 1000) };
  });
}
const flat = (prices: number[]): Candle[] => prices.map((p, i) => ({ time: i + 1, open: p, high: p, low: p, close: p, volume: 1 }));
const rules = { stopPct: null, gainPct: null, slipPct: 0 };

test('nenhum indicador usa candles futuros', () => {
  const c = series(400);
  for (const id of INDICATOR_IDS) {
    const full = INDICATORS[id].signals(c);
    for (const n of [230, 300, 399]) assert.deepEqual(INDICATORS[id].signals(c.slice(0, n)), full.slice(0, n), id);
  }
});

test('run entra na abertura seguinte e vende o que sobrar no fim', () => {
  const r = run(flat([10, 10, 11, 12, 13]), [0, 1, 0, 0, 0], 1, 5, rules);
  assert.equal(r.trades.length, 1);
  assert.equal(r.trades[0].entryPrice, 11);
  assert.equal(r.trades[0].exitPrice, 13);
  assert.ok(Math.abs(r.returnPct - (13 / 11 - 1 - 0.001) * 100) < 0.05, String(r.returnPct));
});

test('derrapagem piora o resultado', () => {
  const c = flat([10, 10, 11, 12, 13]), sig = [0, 1, 0, 0, 0];
  assert.ok(run(c, sig, 1, 5, { ...rules, slipPct: 0.5 }).returnPct < run(c, sig, 1, 5, rules).returnPct - 0.8);
});

test('segurar mede retorno e maior queda', () => {
  const h = hold(flat([10, 20, 15, 18]), 0, 4);
  assert.ok(Math.abs(h.returnPct - 79.9) < 1e-9);
  assert.equal(h.drawdownPct, 25);
});

test('janelas são consecutivas, terminam no fim e usam os 2 anos antes', () => {
  const c = series(WARMUP + TRAIN + 4 * TEST + 10);
  const r = walkForward(c, rules)!;
  assert.equal(r.train, TRAIN);
  assert.equal(r.windows.length, 4);
  assert.equal(r.to, c.at(-1)!.time);
  for (let i = 1; i < r.windows.length; i++) assert.equal(r.windows[i].from, r.windows[i - 1].to + 86400);
});

test('a escolha de uma janela não muda com o que vem depois dela', () => {
  const c = series(WARMUP + TRAIN + 4 * TEST);
  const changed = c.map((x, i) => (i >= c.length - TEST ? { ...x, open: x.open * 3, high: x.high * 3, low: x.low * 3, close: x.close * 3 } : x));
  const a = walkForward(c, rules)!, b = walkForward(changed, rules)!;
  assert.deepEqual(a.windows.map((w) => w.chosen), b.windows.map((w) => w.chosen));
});

test('histórico curto não gera relatório', () => {
  assert.equal(walkForward(series(WARMUP + 100), rules), null);
});
