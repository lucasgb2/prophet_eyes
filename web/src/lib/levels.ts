import { INDICATORS, type IndicatorId } from './indicators';
import type { Candle } from './types';

export type Level = {
  id: IndicatorId; label: string;
  /** Preço de fechamento do candle atual que dispararia compra/venda (null = não alcançável na faixa testada). */
  buy: number | null; sell: number | null;
  /** O candle atual já está dando sinal com o fechamento corrente. */
  active: 1 | -1 | 0;
};

const WINDOW = 400;   // candles recentes bastam: os indicadores convergem e a conta fica rápida
const SPAN = 0.15;    // testa fechamentos de -15% a +15% do preço atual
const STEPS = 60;     // passos por lado

/** Sinal do último candle se ele fechasse em `x` (máxima/mínima ampliadas para conter x). */
function signalAt(c: Candle[], id: IndicatorId, x: number): number {
  const last = c[c.length - 1];
  const t = c.slice(0, -1);
  t.push({ ...last, close: x, high: Math.max(last.high, x), low: Math.min(last.low, x) });
  return INDICATORS[id].signals(t).at(-1) ?? 0;
}

/**
 * Para cada indicador ligado, procura o fechamento mais próximo do preço atual que faria a regra dar
 * compra (+1) e venda (-1) no candle corrente. Reaproveita `signals()`, então vale para qualquer indicador.
 * Descreve a regra do indicador; não é recomendação. Em indicadores de cruzamento o nível só vale para o candle atual.
 */
export function triggerLevels(candles: Candle[], ids: IndicatorId[]): Level[] {
  if (candles.length < 2) return [];
  const c = candles.slice(-WINDOW);
  const p0 = c[c.length - 1].close;
  return ids.filter((id) => INDICATORS[id]).map((id) => {
    const out: Level = { id, label: INDICATORS[id].label, buy: null, sell: null, active: signalAt(c, id, p0) as 1 | -1 | 0 };
    const found = new Set<string>();
    for (const dir of [1, -1]) { // 1 = acima do preço atual, -1 = abaixo
      let prev = p0;
      for (let i = 1; i <= STEPS; i++) {
        const x = p0 * (1 + (dir * SPAN * i) / STEPS);
        const s = signalAt(c, id, x);
        const key = `${dir}:${s}`;
        if (s !== 0 && !found.has(key)) {
          found.add(key);
          // refina por bisseção entre o último passo e este (lo fica do lado do preço atual)
          let lo = prev, hi = x;
          for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (signalAt(c, id, m) === s) hi = m; else lo = m; }
          const cur = s === 1 ? out.buy : out.sell;
          if (cur === null || Math.abs(hi - p0) < Math.abs(cur - p0)) { if (s === 1) out.buy = hi; else out.sell = hi; }
        }
        prev = x;
      }
    }
    return out;
  });
}
