import type { Candle } from './types';

export type Series = (number | null)[];

export function sma(v: number[], n: number): Series {
  const out: Series = [];
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i];
    if (i >= n) sum -= v[i - n];
    out.push(i >= n - 1 ? sum / n : null);
  }
  return out;
}

export function ema(v: number[], n: number): Series {
  const k = 2 / (n + 1);
  const out: Series = [];
  let prev: number | null = null;
  for (let i = 0; i < v.length; i++) {
    if (i < n - 1) { out.push(null); continue; }
    prev = prev === null ? v.slice(0, n).reduce((a, b) => a + b, 0) / n : v[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

// RSI de Wilder
export function rsi(v: number[], n = 14): Series {
  const out: Series = v.map(() => null);
  if (v.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = v[i] - v[i - 1]; if (d >= 0) g += d; else l -= d; }
  g /= n; l /= n;
  out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

export function macd(v: number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(v, fast), s = ema(v, slow);
  const line: Series = v.map((_, i) => (f[i] !== null && s[i] !== null ? f[i]! - s[i]! : null));
  const idx = line.findIndex((x) => x !== null);
  const sig: Series = v.map(() => null);
  if (idx >= 0) {
    const e = ema(line.slice(idx) as number[], signal);
    e.forEach((x, j) => (sig[idx + j] = x));
  }
  const hist: Series = v.map((_, i) => (line[i] !== null && sig[i] !== null ? line[i]! - sig[i]! : null));
  return { line, signal: sig, hist };
}

export function bollinger(v: number[], n = 20, k = 2) {
  const mid = sma(v, n);
  const up: Series = [], lo: Series = [];
  for (let i = 0; i < v.length; i++) {
    if (mid[i] === null) { up.push(null); lo.push(null); continue; }
    const w = v.slice(i - n + 1, i + 1);
    const sd = Math.sqrt(w.reduce((a, x) => a + (x - mid[i]!) ** 2, 0) / n);
    up.push(mid[i]! + k * sd); lo.push(mid[i]! - k * sd);
  }
  return { mid, up, lo };
}

export function atr(c: Candle[], n = 14): Series {
  const tr = c.map((x, i) => i === 0 ? x.high - x.low : Math.max(x.high - x.low, Math.abs(x.high - c[i - 1].close), Math.abs(x.low - c[i - 1].close)));
  const out: Series = tr.map(() => null);
  if (tr.length < n) return out;
  let a = tr.slice(0, n).reduce((x, y) => x + y, 0) / n;
  out[n - 1] = a;
  for (let i = n; i < tr.length; i++) { a = (a * (n - 1) + tr[i]) / n; out[i] = a; }
  return out;
}

// ---- Catálogo usado pela UI, pelo sugeridor e pelos alertas ----
export type IndicatorId = 'sma20' | 'sma50' | 'ema21' | 'bb' | 'rsi' | 'macd';
export type IndicatorDef = {
  id: IndicatorId; label: string; pane: 'price' | 'rsi' | 'macd';
  /** Sinal por candle: +1 compra, -1 venda, 0 nada. */
  signals(c: Candle[]): number[];
};

const cross = (a: Series, b: Series | number, i: number) => {
  const bv = (j: number) => (typeof b === 'number' ? b : b[j]);
  if (i < 1 || a[i] === null || a[i - 1] === null || bv(i) === null || bv(i - 1) === null) return 0;
  if (a[i - 1]! <= bv(i - 1)! && a[i]! > bv(i)!) return 1;
  if (a[i - 1]! >= bv(i - 1)! && a[i]! < bv(i)!) return -1;
  return 0;
};

const closes = (c: Candle[]) => c.map((x) => x.close);

export const INDICATORS: Record<IndicatorId, IndicatorDef> = {
  sma20: { id: 'sma20', label: 'Média móvel 20', pane: 'price', signals: (c) => { const p = closes(c), m = sma(p, 20); return p.map((_, i) => cross(p, m, i)); } },
  sma50: { id: 'sma50', label: 'Média móvel 50', pane: 'price', signals: (c) => { const p = closes(c), m = sma(p, 50); return p.map((_, i) => cross(p, m, i)); } },
  ema21: { id: 'ema21', label: 'EMA 21', pane: 'price', signals: (c) => { const p = closes(c), m = ema(p, 21); return p.map((_, i) => cross(p, m, i)); } },
  bb: { id: 'bb', label: 'Bandas de Bollinger', pane: 'price', signals: (c) => {
    // reversão à média: fechou abaixo da banda inferior = compra; acima da superior = venda
    const p = closes(c), b = bollinger(p);
    return p.map((x, i) => (b.lo[i] !== null && x < b.lo[i]! ? 1 : b.up[i] !== null && x > b.up[i]! ? -1 : 0));
  } },
  rsi: { id: 'rsi', label: 'RSI 14', pane: 'rsi', signals: (c) => {
    const r = rsi(closes(c));
    return r.map((_, i) => (cross(r, 30, i) === 1 ? 1 : cross(r, 70, i) === -1 ? -1 : 0)); // sai da sobrevenda / sai da sobrecompra
  } },
  macd: { id: 'macd', label: 'MACD 12/26/9', pane: 'macd', signals: (c) => { const m = macd(closes(c)); return closes(c).map((_, i) => cross(m.line, m.signal, i)); } },
};

export const INDICATOR_IDS = Object.keys(INDICATORS) as IndicatorId[];
