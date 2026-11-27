import test from 'node:test';
import assert from 'node:assert/strict';
import { retryMs, waitForClose } from './next-candle';

test('espera até o fechamento do candle, mais uma folga', () => {
  assert.equal(waitForClose(1000, '5m', 1100), 200_000 + 3000);
});
test('candle já vencido: checa logo', () => {
  assert.equal(waitForClose(1000, '1m', 5000), 3000);
});
test('espera nunca passa de 1 h', () => {
  assert.equal(waitForClose(1000, '1mo', 1000), 3600_000);
});
test('intervalo de nova tentativa fica entre 30 s e 5 min', () => {
  assert.equal(retryMs('1m'), 30_000);
  assert.equal(retryMs('1d'), 300_000);
});
