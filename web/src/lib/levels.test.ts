import test from 'node:test';
import assert from 'node:assert/strict';
import { triggerLevels } from './levels';

const mk = (closes: number[]) => closes.map((c, i) => ({ time: 1_700_000_000 + i * 60, open: c, high: c + 0.5, low: c - 0.5, close: c, volume: 100 }));

test('média 20: compra acima da média e venda abaixo, quando o preço está do lado oposto', () => {
  // 40 candles em torno de 100; os dois últimos em 95 (abaixo da média): só falta o cruzamento para cima
  const closes = Array.from({ length: 40 }, (_, i) => 100 + (i % 2 ? 0.5 : -0.5)); closes.push(95, 95);
  const [l] = triggerLevels(mk(closes), ['sma20']);
  assert.equal(l.active, 0);
  assert.ok(l.buy !== null && l.buy > 95 && l.buy < 105, `buy=${l.buy}`); // cruzar para cima da média
});
test('nível devolve exatamente o ponto em que o sinal vira', () => {
  const closes = Array.from({ length: 40 }, (_, i) => 100 + (i % 2 ? 0.5 : -0.5)); closes.push(95, 95);
  const c = mk(closes);
  const [l] = triggerLevels(c, ['sma20']);
  const m = c.slice(-20).map((x) => x.close); m[m.length - 1] = l.buy! + 0.01;
  assert.equal(l.sell, null);
  const mean = m.reduce((a, b) => a + b, 0) / 20;
  assert.ok(l.buy! + 0.01 > mean && l.buy! - 0.2 < mean + 0.2);
});
