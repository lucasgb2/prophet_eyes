import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustSplits, bigJumps, parseLine, type HistRow } from './cotahist';

// linha real do arquivo da B3 (PETR4, 26/11/2026)
const REAL = '012026112602PETR4       010PETROBRAS   PN      N2   R$  000000000426100000000044000000000004232000000000428200000000043190000000004307000000000431957597000000000043533300000000186418865200000000000000009999123100000010000000000000BRPETRACNPR6230';

test('lê a linha da B3', () => {
  const r = parseLine(REAL)!;
  assert.deepEqual([r.symbol, r.open, r.high, r.low, r.close, r.volume, r.dismes], ['PETR4', 42.61, 44, 42.32, 43.19, 43533300, 230]);
  assert.equal(new Date(r.time * 1000).toISOString(), '2026-11-26T03:00:00.000Z');
});
test('ignora papel não pedido, cabeçalho e mercado fracionário', () => {
  assert.equal(parseLine(REAL, new Set(['VALE3'])), null);
  assert.equal(parseLine('00COTAHIST.2026'), null);
  assert.equal(parseLine(REAL.slice(0, 24) + '020' + REAL.slice(27)), null);
});

const row = (i: number, close: number, dismes: number, open = close): HistRow => ({ symbol: 'X', time: i * 86400, open, high: close, low: close, close, volume: 100, dismes });
test('desdobramento 1:2 ajusta o passado e dobra o volume', () => {
  const { candles, splits } = adjustSplits([row(1, 40, 1), row(2, 42, 1), row(3, 21.2, 2, 21)]);
  assert.deepEqual(candles.map((c) => c.close), [20, 21, 21.2]);
  assert.equal(candles[0].volume, 200); assert.equal(splits[0].ratio, 0.5);
});
test('queda de dividendo ou tombo sem evento não são ajustados', () => {
  assert.equal(adjustSplits([row(1, 40, 1), row(2, 38, 2)]).splits.length, 0); // evento, salto pequeno
  assert.equal(adjustSplits([row(1, 40, 1), row(2, 20, 1)]).splits.length, 0); // salto grande sem evento
});
test('acha o salto de um desdobramento que ficou sem ajuste', () => {
  assert.deepEqual(bigJumps([row(1, 40, 1), row(2, 42, 1), row(3, 21.2, 2, 21), row(4, 22, 2)]), [3 * 86400]);
  assert.deepEqual(bigJumps([row(1, 40, 1), row(2, 38, 1)]), []);
});
