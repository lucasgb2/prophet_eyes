import test from 'node:test';
import assert from 'node:assert/strict';
import { planPosition } from './risk';

const base = { capital: 10000, riskPct: 1, entry: 40, stop: 38, step: 1, cost: 0 };
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('quantidade = risco aceito dividido pela perda por ação', () => {
  const p = planPosition(base)!;
  assert.equal(p.qty, 50); assert.equal(p.limitedBy, 'risco'); near(p.maxLoss, 100); near(p.value, 2000); near(p.stopPct, 5);
});
test('custo entra na perda e reduz a quantidade; nunca passa do risco aceito', () => {
  const p = planPosition({ ...base, cost: 0.001 })!;
  assert.equal(p.qty, 49); assert.ok(p.maxLoss <= 100);
});
test('lote padrão arredonda para baixo, podendo dar zero', () => {
  assert.equal(planPosition({ ...base, capital: 100000, step: 100 })!.qty, 500);
  assert.equal(planPosition({ ...base, step: 100 })!.qty, 0);
});
test('stop curto não alavanca: a posição para no capital', () => {
  const p = planPosition({ ...base, stop: 39.9 })!;
  assert.equal(p.limitedBy, 'capital'); assert.equal(p.qty, 250);
});
test('alvo dá o ganho e a relação ganho/risco', () => {
  const p = planPosition({ ...base, target: 46 })!;
  near(p.gain!, 300); near(p.rewardRisk!, 3);
});
test('quantidade fracionária (cripto) e entradas inválidas', () => {
  assert.equal(planPosition({ ...base, entry: 60000, stop: 57000, step: 0.00001 })!.qty, 0.03333);
  assert.equal(planPosition({ ...base, stop: 41 }), null);
  assert.equal(planPosition({ ...base, capital: NaN }), null);
});
