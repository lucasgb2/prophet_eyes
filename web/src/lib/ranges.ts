import type { Timeframe } from './types';

// Janela inicial (primeira carga) e limite por timeframe, conforme o que a brapi aceita para cada intervalo.
export const INITIAL_RANGE: Record<Timeframe, { interval: string; range: string; maxDays: number; minDays: number }> = {
  '1m': { interval: '1m', range: '5d', maxDays: 5, minDays: 1 },
  '5m': { interval: '5m', range: '5d', maxDays: 5, minDays: 1 },
  '15m': { interval: '15m', range: '5d', maxDays: 5, minDays: 1 },
  '30m': { interval: '30m', range: '1mo', maxDays: 31, minDays: 1 },
  '60m': { interval: '60m', range: '1mo', maxDays: 31, minDays: 1 },
  '1d': { interval: '1d', range: '1y', maxDays: 366, minDays: 1 },
  '1wk': { interval: '1wk', range: '5y', maxDays: 1830, minDays: 92 },
  '1mo': { interval: '1mo', range: 'max', maxDays: 100000, minDays: 366 },
};

const RANGES: [string, number][] = [['1d', 1], ['5d', 5], ['1mo', 31], ['3mo', 92], ['6mo', 183], ['1y', 366], ['2y', 731], ['5y', 1830]];

/** Menor range da brapi que cobre o trecho faltante; sem cache, usa a janela inicial. */
export function pickRange(tf: Timeframe, lastCachedSec: number | null, nowSec = Date.now() / 1000): string {
  const cfg = INITIAL_RANGE[tf];
  if (lastCachedSec == null) return cfg.range;
  const gapDays = Math.max((nowSec - lastCachedSec) / 86400 + 1, cfg.minDays);
  const hit = RANGES.find(([, d]) => d >= gapDays);
  return hit && hit[1] <= cfg.maxDays ? hit[0] : cfg.range;
}

// ---- Limites do plano da brapi ----
const ORDER = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'max'];

/** Lê "Ranges permitidos: 1d, 5d, 1mo, 3mo." da mensagem de erro da brapi (ou de BRAPI_RANGES="1d,5d,1mo,3mo"). */
export function parseAllowedRanges(text: string): string[] | null {
  const m = /Ranges? permitidos?:\s*([^.\n]+)/i.exec(text) ?? /^([0-9a-z, ]+)$/i.exec(text.trim());
  const list = (m?.[1] ?? '').split(',').map((x) => x.trim()).filter((x) => ORDER.includes(x));
  return list.length ? list : null;
}

/** Maior range permitido que não passa do pedido; se o pedido for menor que todos, o menor permitido. */
export function clampRange(range: string, allowed: string[] | null): string {
  if (!allowed || allowed.includes(range)) return range;
  const want = ORDER.indexOf(range);
  const sorted = [...allowed].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const below = sorted.filter((r) => ORDER.indexOf(r) < want);
  return below.length ? below[below.length - 1] : sorted[0];
}
