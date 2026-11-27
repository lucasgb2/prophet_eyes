import test from 'node:test';
import assert from 'node:assert/strict';
import { COST, evaluate } from './suggest';
import type { Candle } from './types';

const candle = (i: number, open: number, close: number): Candle => ({ time: i * 86400, open, close, high: Math.max(open, close), low: Math.min(open, close), volume: 1 });
// alta constante de 1% por candle: nenhum sinal pode ser melhor que um candle qualquer
const up = Array.from({ length: 80 }, (_, i) => candle(i, 100 * 1.01 ** i, 100 * 1.01 ** (i + 1)));
const at = (n: number, idx: number[], v = 1) => Array.from({ length: n }, (_, i) => (idx.includes(i) ? v : 0));
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('papel só subindo: retorno positivo, vantagem zero sobre a régua', () => {
  const r = evaluate(up, at(80, [2, 12, 22, 42, 52, 62]))!;
  assert.ok(r.avgReturnPct > 0);
  near(r.edgePct, 0); near(r.edgeFirstPct!, 0); near(r.edgeSecondPct!, 0);
});
test('entrada é na abertura do candle seguinte: o salto até lá não conta', () => {
  // fecha em 100 no sinal e já abre em 110; depois fica parado
  const c = Array.from({ length: 60 }, (_, i) => candle(i, i % 10 === 1 ? 110 : 100, i % 10 === 0 ? 100 : 110));
  const r = evaluate(c, at(60, [0, 10, 20, 30, 40]))!;
  near(r.avgReturnPct, -COST * 100);
});
test('vendas ficam fora do ranking e são contadas à parte', () => {
  const sig = at(80, [2, 12, 22, 32, 42]).map((v, i) => v || ([5, 15, 25, 35, 45].includes(i) ? -1 : 0));
  const r = evaluate(up, sig)!;
  assert.equal(r.signals, 5);
  assert.deepEqual(r.sell, { signals: 5, fallRate: 0, baseFallRate: 0 });
  assert.equal(evaluate(up, at(80, [5, 15, 25, 35, 45], -1)), null);
});
