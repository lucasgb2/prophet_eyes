import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TASKS, assess, type TaskName } from './health';

const MIN = 60_000, NOW = 1_800_000_000_000;
const all = (okAt: number) => (Object.keys(TASKS) as TaskName[]).map((name) => ({ name, okAt }));
const names = (p: { name: string }[]) => p.map((x) => x.name);

test('tudo em dia não gera problema', () => {
  assert.deepEqual(assess(all(NOW - MIN), NOW, NOW - 3600_000), []);
});

test('cada tarefa tem o seu prazo', () => {
  assert.deepEqual(names(assess(all(NOW - 20 * MIN), NOW, NOW)), ['alertas', 'sinais', 'robos', 'diario']);
  assert.deepEqual(names(assess(all(NOW - 37 * 60 * MIN), NOW, NOW)), Object.keys(TASKS));
});

test('sem registro só vira problema depois do prazo contado do início', () => {
  assert.deepEqual(assess([], NOW, NOW - 5 * MIN), []);
  assert.deepEqual(names(assess([], NOW, NOW - 31 * MIN)), ['alertas', 'sinais', 'robos', 'diario', 'dados']);
});

test('linha sem ok_at (só marcada pelo vigia) conta como sem registro', () => {
  assert.equal(assess([{ name: 'robos', okAt: null }], NOW, NOW - 11 * MIN).find((p) => p.name === 'robos')?.okAt, null);
});
