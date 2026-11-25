import test from 'node:test';
import assert from 'node:assert/strict';
import { sma, rsi, ema } from './indicators';

test('sma', () => assert.deepEqual(sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]));
test('ema começa com a média simples', () => assert.equal(ema([1, 2, 3, 4], 3)[2], 2));
test('rsi = 100 em alta contínua', () => {
  const v = Array.from({ length: 30 }, (_, i) => i + 1);
  assert.equal(rsi(v)[29], 100);
});
