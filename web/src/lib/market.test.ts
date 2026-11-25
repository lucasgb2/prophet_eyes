import test from 'node:test';
import assert from 'node:assert/strict';
import { isTradingDay, marketOpen, lastSessionEnd, needsRefresh } from './market';

// helper: horário de Brasília -> epoch s
const brt = (iso: string) => Date.parse(`${iso}-03:00`) / 1000;

test('dia útil, sábado e feriado', () => {
  assert.equal(isTradingDay(brt('2026-11-25T12:00:00')), true);  // quarta
  assert.equal(isTradingDay(brt('2026-11-28T12:00:00')), false); // sábado
  assert.equal(isTradingDay(brt('2026-11-20T12:00:00')), false); // Consciência Negra
});
test('mercado aberto só em horário de pregão', () => {
  assert.equal(marketOpen(brt('2026-11-25T11:00:00')), true);
  assert.equal(marketOpen(brt('2026-11-25T08:00:00')), false);
  assert.equal(marketOpen(brt('2026-11-25T20:00:00')), false);
  assert.equal(marketOpen(brt('2026-11-28T11:00:00')), false);
});
test('fim do último pregão: noite, fim de semana e feriado', () => {
  assert.equal(lastSessionEnd(brt('2026-11-25T20:00:00')), brt('2026-11-25T18:50:00'));
  assert.equal(lastSessionEnd(brt('2026-11-25T08:00:00')), brt('2026-11-24T18:50:00'));
  assert.equal(lastSessionEnd(brt('2026-11-29T15:00:00')), brt('2026-11-27T18:50:00')); // domingo -> sexta
  assert.equal(lastSessionEnd(brt('2026-11-23T08:00:00')), brt('2026-11-19T18:50:00')); // seg cedo, sexta 20/11 feriado -> quinta
});
test('aberto: respeita o prazo do timeframe', () => {
  const now = brt('2026-11-25T11:00:00');
  assert.equal(needsRefresh('5m', now - 30, now), false);
  assert.equal(needsRefresh('5m', now - 90, now), true);
  assert.equal(needsRefresh('1d', now - 200, now), false);
  assert.equal(needsRefresh('1m', now - 40, now), true);
});
test('fechado: não busca se já sincronizou depois do fechamento', () => {
  const now = brt('2026-11-25T21:00:00');
  assert.equal(needsRefresh('1d', brt('2026-11-25T19:00:00'), now), false);
  assert.equal(needsRefresh('1d', brt('2026-11-25T15:00:00'), now), true); // falta o fechamento
  assert.equal(needsRefresh('5m', null, now), true);
});
test('fim de semana: sexta após o fechamento basta até segunda', () => {
  assert.equal(needsRefresh('5m', brt('2026-11-27T19:00:00'), brt('2026-11-29T12:00:00')), false);
  assert.equal(needsRefresh('5m', brt('2026-11-27T17:00:00'), brt('2026-11-29T12:00:00')), true);
});
