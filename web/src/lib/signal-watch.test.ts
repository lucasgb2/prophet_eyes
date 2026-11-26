import test from 'node:test';
import assert from 'node:assert/strict';
import { latestSignal, signalKey, validBells } from './signal-watch';
import type { Candle } from './types';

// 60 candles estáveis em 100 e o último salta para 110: cruza acima da média móvel de 20
const mk = (t0: number): Candle[] => Array.from({ length: 61 }, (_, i) => { const p = i < 60 ? 100 : 110; return { time: t0 + i * 86400, open: p, high: p + 1, low: p - 1, close: p, volume: 1 }; });

test('sinal no último candle é detectado', () => {
  const c = mk(1_700_000_000), now = c.at(-1)!.time + 3600;
  const f = latestSignal(c, 'sma20', '1d', now);
  assert.equal(f?.side, 1); assert.equal(f?.sideText, 'compra');
  assert.match(signalKey('b3|PETR4|1d', f!), /sma20\|\d+\|1$/);
});
test('candle velho demais não avisa', () => {
  const c = mk(1_700_000_000);
  assert.equal(latestSignal(c, 'sma20', '1d', c.at(-1)!.time + 6 * 86400), null);
});
test('sem sinal no último candle não avisa', () => {
  const c = mk(1_700_000_000).slice(0, 60);
  assert.equal(latestSignal(c, 'sma20', '1d', c.at(-1)!.time + 60), null);
});
test('validBells filtra ids inválidos', () => {
  assert.deepEqual(validBells(['rsi', 'xxx', 'sma20']).sort(), ['rsi', 'sma20']);
  assert.deepEqual(validBells('rsi'), []);
});
