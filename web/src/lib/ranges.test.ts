import test from 'node:test';
import assert from 'node:assert/strict';
import { pickRange } from './ranges';

const now = 1_700_000_000;
test('sem cache usa a janela inicial', () => assert.equal(pickRange('1d', null, now), '1y'));
test('cache de ontem busca só poucos dias', () => assert.equal(pickRange('1d', now - 86400, now), '5d'));
test('cache de 3 semanas busca 1mo', () => assert.equal(pickRange('1d', now - 21 * 86400, now), '1mo'));
test('gap maior que o máximo do intraday volta à janela inicial', () => assert.equal(pickRange('5m', now - 20 * 86400, now), '5d'));
test('semanal respeita o mínimo de 3mo', () => assert.equal(pickRange('1wk', now - 86400, now), '3mo'));
test('1m usa janela de 5d', () => assert.equal(pickRange('1m', null, now), '5d'));
import { clampRange, parseAllowedIntervals, parseAllowedRanges } from './ranges';
const free = ['1d', '5d', '1mo', '3mo'];
test('lê os ranges da mensagem da brapi', () =>
  assert.deepEqual(parseAllowedRanges('O range "1y" não está disponível no seu plano. Ranges permitidos: 1d, 5d, 1mo, 3mo. Faça upgrade'), free));
test('lê a lista de BRAPI_RANGES', () => assert.deepEqual(parseAllowedRanges('1d,5d,1mo'), ['1d', '5d', '1mo']));
test('range permitido passa direto', () => assert.equal(clampRange('1mo', free), '1mo'));
test('range acima do plano cai para o maior permitido', () => { assert.equal(clampRange('1y', free), '3mo'); assert.equal(clampRange('max', free), '3mo'); });
test('sem limite conhecido não altera', () => assert.equal(clampRange('1y', null), '1y'));
import { firstGapStart } from './ranges';
const D = 86400;
test('lacuna: fim de semana não conta, buraco de semanas sim', () => {
  assert.equal(firstGapStart([0, D, 2 * D, 5 * D, 6 * D], '1d'), null);
  assert.equal(firstGapStart([0, D, 2 * D, 20 * D, 21 * D], '1d'), 2 * D);
  assert.equal(firstGapStart([0, 7 * D, 14 * D], '1wk'), null);
});

test('lê os intervalos permitidos da mensagem da brapi', () => {
  assert.deepEqual(parseAllowedIntervals('O intervalo "1m" não está disponível no seu plano. Intervalos permitidos: 1d. Faça upgrade para o plano Startup (R$ 119,99/mês) para usar este intervalo.'), ['1d']);
  assert.deepEqual(parseAllowedIntervals('1d,1wk,1mo'), ['1d', '1wk', '1mo']);
  assert.equal(parseAllowedIntervals('erro qualquer'), null);
});
