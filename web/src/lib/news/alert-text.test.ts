import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeByTitle, groupMessage, type PendingNews } from './alert-text';

const n = (title: string, i = 0): PendingNews => ({ market: 'b3', symbol: 'PETR4', url: `https://x.com/${i}`, title, source: 'Valor', kind: 'noticia', category: 'resultados' });
test('mesmo título em veículos diferentes avisa uma vez', () => {
  assert.equal(dedupeByTitle([n('Petrobras lucra mais', 1), n('PETROBRAS LUCRA MAIS!', 2), n('Outra', 3)]).length, 2);
});
test('mensagem agrupada limita a 5 e conta o resto', () => {
  const m = groupMessage('PETR4', Array.from({ length: 8 }, (_, i) => n(`t${i}`, i)));
  assert.match(m, /8 notícias novas/); assert.match(m, /e mais 3/); assert.equal(m.match(/• /g)!.length, 5);
});
