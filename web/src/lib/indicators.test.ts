import test from 'node:test';
import assert from 'node:assert/strict';
import { sma, rsi, ema } from './indicators';

test('sma', () => assert.deepEqual(sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]));
test('ema começa com a média simples', () => assert.equal(ema([1, 2, 3, 4], 3)[2], 2));
test('rsi = 100 em alta contínua', () => {
  const v = Array.from({ length: 30 }, (_, i) => i + 1);
  assert.equal(rsi(v)[29], 100);
});

import { stochastic, adx, obv, donchian, vwap } from './indicators';
const mk = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ time: 1_700_000_000 + i * 60, open: f(i), high: f(i) + 1, low: f(i) - 1, close: f(i), volume: 100 }));
test('obv acumula volume em alta contínua', () => assert.equal(obv(mk(5, (i) => i)).at(-1), 400));
test('estocástico fica em 0–100 e %K alto em alta contínua', () => {
  const s = stochastic(mk(40, (i) => i));
  assert.ok(s.k.at(-1)! > 80 && s.k.at(-1)! <= 100);
});
test('adx forte e +DI > -DI em alta contínua', () => {
  const a = adx(mk(80, (i) => i * 2));
  assert.ok(a.adx.at(-1)! > 25); assert.ok(a.plus.at(-1)! > a.minus.at(-1)!);
});
test('donchian usa máxima/mínima da janela', () => { const d = donchian(mk(25, (i) => i), 20); assert.equal(d.up[19], 20); assert.equal(d.lo[19], -1); });
test('vwap = preço típico quando o preço é constante', () => assert.equal(vwap(mk(5, () => 10)).at(-1), 10));

import { suggestIndicators } from './suggest';
test('sugestor devolve ranking ordenado por nota e ignora amostras pequenas', () => {
  const c = mk(300, (i) => 100 + 10 * Math.sin(i / 8));
  const r = suggestIndicators(c);
  assert.ok(r.length > 0);
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].score >= r[i].score);
  assert.ok(r.every((x) => x.signals >= 5));
});
