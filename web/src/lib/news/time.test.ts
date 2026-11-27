import test from 'node:test';
import assert from 'node:assert/strict';
import { dateLabel, relativeTime } from './time';

const t = Date.UTC(2026, 10, 24, 18, 11) / 1000; // 24/11 15:11 em Brasília
test('hora relativa', () => {
  assert.equal(relativeTime(t, false, t + 20), 'agora');
  assert.equal(relativeTime(t, false, t + 5 * 60), 'há 5 min');
  assert.equal(relativeTime(t, false, t + 3700), 'há 1 h');
  assert.equal(relativeTime(t, false, t + 26 * 3600), 'ontem');
  assert.equal(relativeTime(t, false, t + 3 * 86400), 'há 3 dias');
});
test('só data (CVM) não inventa hora', () => {
  assert.equal(relativeTime(t, true, t + 3600), 'hoje');
  assert.equal(dateLabel(t, true), '24/11');
  assert.equal(dateLabel(t, false), '24/11 - 15:11');
});
