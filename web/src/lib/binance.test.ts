import test from 'node:test';
import assert from 'node:assert/strict';
import { floorToStep, prepareOrder, parseKlines, sign, type Rules } from './binance';
import { seal, open } from './crypto-box';
import { splitPair, cacheSymbol, validSymbol, marketOf, pricePrecision } from './markets';

const rules: Rules = { symbol: 'BTCUSDT', status: 'TRADING', base: 'BTC', quote: 'USDT', stepSize: '0.00001000', minQty: '0.00001000', maxQty: '9000.00000000', tickSize: '0.01000000', minPrice: '0.01', minNotional: '5.00000000' };

test('assinatura HMAC confere com o exemplo da documentação da Binance', () =>
  assert.equal(sign('NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j',
    'symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559'),
  'c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71'));

test('floorToStep arredonda para baixo sem erro de ponto flutuante', () => {
  assert.equal(floorToStep('0.123456789', '0.00001000'), '0.12345');
  assert.equal(floorToStep('1', '0.001'), '1.000');
  assert.equal(floorToStep('0.3', '0.1'), '0.3');           // 0.3 em float seria 0.29999…
  assert.equal(floorToStep('100.019', '0.01'), '100.01');
  assert.equal(floorToStep('5.9', '1'), '5');
  assert.equal(floorToStep('0.00000999', '0.00001'), '0.00000');
});

test('prepareOrder normaliza e valida contra os filtros do par', () => {
  const o = prepareOrder(rules, { side: 'BUY', type: 'LIMIT', quantity: '0,0012345678', price: '60000.129' }, 60000);
  assert.equal(o.quantity, '0.00123'); assert.equal(o.price, '60000.12');
  assert.ok(Math.abs(o.notional - 0.00123 * 60000.12) < 1e-9);
  assert.throws(() => prepareOrder(rules, { side: 'BUY', type: 'MARKET', quantity: '0.000001' }, 60000), /abaixo do mínimo/);
  assert.throws(() => prepareOrder(rules, { side: 'BUY', type: 'MARKET', quantity: '0.00005' }, 60000), /Valor da ordem/); // 3 USDT < 5
  assert.throws(() => prepareOrder(rules, { side: 'BUY', type: 'LIMIT', quantity: '1' }, 60000), /Preço inválido/);
  assert.throws(() => prepareOrder(rules, { side: 'BUY', type: 'MARKET', quantity: 'abc' }, 60000), /Quantidade inválida/);
  assert.throws(() => prepareOrder({ ...rules, status: 'BREAK' }, { side: 'BUY', type: 'MARKET', quantity: '1' }, 1), /negociável/);
});

test('parseKlines converte os campos da Binance', () => {
  const [c] = parseKlines([[1795647600000, '10.5', '12', '9', '11', '3.5', 0]]);
  assert.deepEqual(c, { time: 1795647600, open: 10.5, high: 12, low: 9, close: 11, volume: 3.5 });
});

test('segredo criptografado volta igual e não revela o texto', () => {
  process.env.CREDENTIALS_KEY = 'uma-chave-de-teste-bem-longa-123456';
  const s = seal('segredo-da-api');
  assert.ok(!s.includes('segredo-da-api'));
  assert.equal(open(s), 'segredo-da-api');
  assert.throws(() => open(s.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))));      // adulterado
  assert.notEqual(seal('x'), seal('x'));                                              // IV aleatório
});

test('mercados: validação de símbolo, chave de cache e pares', () => {
  assert.equal(validSymbol('b3', 'PETR4'), true); assert.equal(validSymbol('b3', 'BTC'), false); assert.equal(validSymbol('b3', 'BTCUSDT2025'), false);
  assert.equal(validSymbol('binance', 'BTCUSDT'), true); assert.equal(validSymbol('binance', 'btc'), false);
  assert.equal(cacheSymbol('b3', 'PETR4'), 'PETR4'); assert.equal(cacheSymbol('binance', 'BTCUSDT'), 'BINANCE:BTCUSDT');
  assert.deepEqual(splitPair('BTCUSDT'), { base: 'BTC', quote: 'USDT' });
  assert.deepEqual(splitPair('ETHBTC'), { base: 'ETH', quote: 'BTC' });
  assert.equal(marketOf(undefined), 'b3'); assert.equal(marketOf('xpto'), null);
  assert.equal(pricePrecision('binance', 0.00001), 8); assert.equal(pricePrecision('b3', 0.5), 2);
});
