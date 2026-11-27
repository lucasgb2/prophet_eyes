/** Tamanho de posição para uma COMPRA com stop. Funções puras. */
export type RiskInput = {
  capital: number; riskPct: number; entry: number; stop: number; target?: number | null;
  /** Menor passo de quantidade: 100 no lote padrão da B3, 1 no fracionário, 0.00001 em cripto. */
  step: number;
  /** Custo de ida e volta, como fração do valor de entrada. */
  cost: number;
};

export type RiskPlan = {
  qty: number; value: number; maxLoss: number; lossPct: number; stopPct: number;
  /** O que limitou a quantidade: o risco aceito ou o capital disponível (sem alavancagem). */
  limitedBy: 'risco' | 'capital';
  gain: number | null; rewardRisk: number | null;
};

const floorTo = (x: number, step: number) => Number((Math.floor(x / step + 1e-9) * step).toFixed(8));

/** null = dados incompletos ou stop que não está abaixo da entrada. */
export function planPosition(i: RiskInput): RiskPlan | null {
  const { capital, riskPct, entry, stop, step, cost } = i;
  if (![capital, riskPct, entry, stop, step].every((n) => Number.isFinite(n) && n > 0) || stop >= entry) return null;
  const lossPerUnit = entry - stop + entry * cost;
  const byRisk = (capital * riskPct) / 100 / lossPerUnit, byCapital = capital / (entry * (1 + cost));
  const qty = floorTo(Math.min(byRisk, byCapital), step);
  const maxLoss = qty * lossPerUnit;
  const target = i.target != null && i.target > entry ? i.target : null;
  const gainPerUnit = target == null ? null : target - entry - entry * cost;
  return {
    qty, value: qty * entry, maxLoss, lossPct: (maxLoss / capital) * 100, stopPct: ((entry - stop) / entry) * 100,
    limitedBy: byCapital < byRisk ? 'capital' : 'risco',
    gain: gainPerUnit == null ? null : qty * gainPerUnit,
    rewardRisk: gainPerUnit == null ? null : gainPerUnit / lossPerUnit,
  };
}
