import test from 'node:test';
import assert from 'node:assert/strict';
import { crosshairLabel, isIntraday, tickLabel } from './chart-time';

const t = Date.UTC(2026, 10, 27, 13, 30) / 1000;
test('13:30 UTC aparece como 10:30 de Brasília', () => {
  assert.equal(tickLabel(t, 3), '10:30');
  assert.equal(crosshairLabel(t), '27/11/26 10:30');
});
test('marca de dia mostra a data', () => assert.equal(tickLabel(t, 2), '27/11'));
test('distingue intraday de diário', () => {
  assert.equal(isIntraday([t, t + 900, t + 1800]), true);
  assert.equal(isIntraday([t, t + 86400, t + 4 * 86400]), false);
});
