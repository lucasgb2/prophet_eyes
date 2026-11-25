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
