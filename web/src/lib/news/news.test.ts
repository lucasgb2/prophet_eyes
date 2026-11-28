import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, parseFeed } from './parse';
import { closeTime, reactionFor, statsByCategory } from './reaction';
import { csvRows, unzipFirst } from './cvm';
import { deflateRawSync } from 'node:zlib';
import type { Candle } from '../types';

test('RSS: tira o veículo do título e ignora link que não é http', () => {
  const xml = `<rss><item><title>Petrobras lucra mais - Valor</title><link>https://x.com/a?b=1&amp;c=2</link><pubDate>Tue, 24 Nov 2026 17:31:00 GMT</pubDate><source url="https://valor">Valor</source></item>
    <item><title>mau</title><link>javascript:alert(1)</link><pubDate>Tue, 24 Nov 2026 17:31:00 GMT</pubDate></item></rss>`;
  const r = parseFeed(xml);
  assert.equal(r.length, 1);
  assert.equal(r[0].title, 'Petrobras lucra mais'); assert.equal(r[0].url, 'https://x.com/a?b=1&c=2'); assert.equal(r[0].source, 'Valor');
});
test('Atom com link em atributo e CDATA', () => {
  const r = parseFeed('<feed><entry><title type="text"><![CDATA[Copom &amp; Selic]]></title><updated>2026-11-27T08:32:01-03:00</updated><link rel="alternate" href="https://bcb.gov.br/n/1"/></entry></feed>');
  assert.equal(r[0].url, 'https://bcb.gov.br/n/1'); assert.equal(r[0].title, 'Copom & Selic'); // portais costumam deixar entidades dentro do CDATA
});
test('classificação por assunto', () => {
  assert.equal(classify('Pagamento de juros sobre capital próprio'), 'dividendos');
  assert.equal(classify('Copom mantém a Selic'), 'macro');
  assert.equal(classify('Lucro do 3T26 sobe'), 'resultados');
  assert.equal(classify('Aniversário da empresa'), 'outros');
});

// 40 candles de 1 dia (binance): oscila 100/101 e salta 5% no candle 30
const day = 86400, t0 = 1_700_006_400 - (1_700_006_400 % day);
const cs: Candle[] = Array.from({ length: 40 }, (_, i) => { const c = i >= 30 ? 106 : i % 2 ? 101 : 100; return { time: t0 + i * day, open: c, high: c, low: c, close: c, volume: 1 }; });

test('reação mede a partir do último candle fechado antes da notícia', () => {
  const r = reactionFor(cs, '1d', 'binance', t0 + 30 * day + 3600)!; // saiu durante o candle 30
  assert.equal(r.refTime, cs[29].time); assert.equal(r.firstTime, cs[30].time);
  const m1 = r.moves.find((m) => m.h === 1)!;
  assert.ok(m1.pct > 4.9 && m1.times! > 4, `${m1.pct} ${m1.times}`);
});
test('notícia anterior ao histórico não tem reação; recente demais não tem movimentos', () => {
  assert.equal(reactionFor(cs, '1d', 'binance', t0 - day), null);
  assert.equal(reactionFor(cs, '1d', 'binance', t0 + 100 * day)!.moves.length, 0);
});
test('B3 diário fecha às 21h UTC', () => {
  assert.equal(closeTime({ ...cs[0], time: t0 + 3 * 3600 }, '1d', 'b3'), t0 + 21 * 3600);
});
test('estatística conta um evento por candle', () => {
  const r = reactionFor(cs, '1d', 'binance', t0 + 30 * day); // saiu na virada do candle: sem ressalva
  const s = statsByCategory([{ category: 'resultados', reaction: r }, { category: 'resultados', reaction: r }]);
  assert.equal(s[0].events, 1); assert.equal(s[0].up, 1);
});

test('zip da CVM: lê o primeiro arquivo e o CSV', () => {
  const data = Buffer.from('A;B\n1;x "y"\n', 'latin1'), comp = deflateRawSync(data), name = Buffer.from('a.csv');
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(0, 42);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt32LE(30 + name.length + comp.length, 16);
  const zip = Buffer.concat([local, name, comp, central, end]);
  assert.deepEqual(csvRows(unzipFirst(zip).toString('latin1')), [{ A: '1', B: 'x "y"' }]);
});

test('RSS: lê as categorias do item', () => {
  const r = parseFeed('<rss><item><title>a</title><link>https://x.com/1</link><pubDate>Tue, 24 Nov 2026 17:31:00 GMT</pubDate><category><![CDATA[Mercados]]></category><category>Bolsa</category></item></rss>');
  assert.deepEqual(r[0].tags, ['Mercados', 'Bolsa']);
});

test('diário: notícia no meio do candle é marcada e fica fora do resumo; sem hora (CVM) não é marcada', () => {
  const pub = t0 + 30 * day + 3600, r = reactionFor(cs, '1d', 'binance', pub)!;
  assert.equal(r.caveat, 'durante');
  assert.deepEqual(statsByCategory([{ category: 'outros', reaction: r }]), []);
  assert.equal(reactionFor(cs, '1d', 'binance', pub, true)!.caveat, null);
});
test('B3 diário: antes da abertura não é "durante"', () => {
  const b3 = cs.map((c) => ({ ...c, time: c.time + 3 * 3600 }));
  assert.equal(reactionFor(b3, '1d', 'b3', t0 + 30 * day + 11 * 3600)!.caveat, null); // 08h de Brasília
  assert.equal(reactionFor(b3, '1d', 'b3', t0 + 30 * day + 17 * 3600)!.caveat, 'durante'); // 14h
});
test('intraday: reação que atravessa a noite é gap e não tem "× o normal"', () => {
  const mk = (t: number, c: number) => ({ time: t, open: c, high: c, low: c, close: c, volume: 1 });
  const d1 = Array.from({ length: 30 }, (_, i) => mk(t0 + i * 900, 100 + (i % 2) * 0.1));
  const d2 = Array.from({ length: 5 }, (_, i) => mk(t0 + day + i * 900, 104));
  const r = reactionFor([...d1, ...d2], '15m', 'b3', t0 + 12 * 3600)!;
  assert.equal(r.caveat, 'gap'); assert.equal(r.moves[0].times, null); assert.ok(r.moves[0].pct > 3);
  assert.equal(reactionFor([...d1, ...d2], '15m', 'b3', t0 + 20 * 900 + 60)!.caveat, null);
});
