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

// VWAP reiniciado a cada dia de pregão (horário de Brasília). Em candles diários equivale ao preço típico.
export function vwap(c: Candle[]): Series {
  let pv = 0, vol = 0, day = -1;
  return c.map((x) => {
    const d = Math.floor((x.time - 3 * 3600) / 86400);
    if (d !== day) { day = d; pv = 0; vol = 0; }
    const tp = (x.high + x.low + x.close) / 3;
    pv += tp * x.volume; vol += x.volume;
    return vol > 0 ? pv / vol : tp;
  });
}

// Canal de Donchian: máxima e mínima dos últimos n candles
export function donchian(c: Candle[], n = 20) {
  const up: Series = [], lo: Series = [];
  for (let i = 0; i < c.length; i++) {
    if (i < n - 1) { up.push(null); lo.push(null); continue; }
    const w = c.slice(i - n + 1, i + 1);
    up.push(Math.max(...w.map((x) => x.high))); lo.push(Math.min(...w.map((x) => x.low)));
  }
  return { up, lo };
}

// Estocástico lento: %K suavizado e %D
export function stochastic(c: Candle[], n = 14, smoothK = 3, smoothD = 3) {
  const raw: Series = c.map((x, i) => {
    if (i < n - 1) return null;
    const w = c.slice(i - n + 1, i + 1);
    const hh = Math.max(...w.map((y) => y.high)), ll = Math.min(...w.map((y) => y.low));
    return hh === ll ? 50 : ((x.close - ll) / (hh - ll)) * 100;
  });
  const smooth = (s: Series, k: number): Series => {
    const idx = s.findIndex((x) => x !== null);
    const out: Series = s.map(() => null);
    if (idx < 0) return out;
    sma(s.slice(idx) as number[], k).forEach((x, j) => (out[idx + j] = x));
    return out;
  };
  const k = smooth(raw, smoothK);
  return { k, d: smooth(k, smoothD) };
}

// ADX de Wilder com +DI e -DI
export function adx(c: Candle[], n = 14) {
  const len = c.length;
  const nul = (): Series => c.map(() => null);
  const out = { adx: nul(), plus: nul(), minus: nul() };
  if (len <= 2 * n) return out;
  const tr: number[] = [0], pdm: number[] = [0], mdm: number[] = [0];
  for (let i = 1; i < len; i++) {
    const up = c[i].high - c[i - 1].high, dn = c[i - 1].low - c[i].low;
    pdm.push(up > dn && up > 0 ? up : 0); mdm.push(dn > up && dn > 0 ? dn : 0);
    tr.push(Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close)));
  }
  let str = 0, sp = 0, sm = 0;
  for (let i = 1; i <= n; i++) { str += tr[i]; sp += pdm[i]; sm += mdm[i]; }
  const dx: number[] = [];
  for (let i = n; i < len; i++) {
    if (i > n) { str = str - str / n + tr[i]; sp = sp - sp / n + pdm[i]; sm = sm - sm / n + mdm[i]; }
    const pi = str ? (100 * sp) / str : 0, mi = str ? (100 * sm) / str : 0;
    out.plus[i] = pi; out.minus[i] = mi;
    dx.push(pi + mi ? (100 * Math.abs(pi - mi)) / (pi + mi) : 0);
  }
  let a = dx.slice(0, n).reduce((x, y) => x + y, 0) / n;
  out.adx[2 * n - 1] = a;
  for (let j = n; j < dx.length; j++) { a = (a * (n - 1) + dx[j]) / n; out.adx[n + j] = a; }
  return out;
}

// On-Balance Volume
export function obv(c: Candle[]): number[] {
  let acc = 0;
  return c.map((x, i) => {
    if (i > 0) acc += x.close > c[i - 1].close ? x.volume : x.close < c[i - 1].close ? -x.volume : 0;
    return acc;
  });
}

// ---- Catálogo usado pela UI, pelo sugeridor e pelos alertas ----
export type IndicatorId = 'ema9' | 'sma20' | 'sma50' | 'sma200' | 'ema21' | 'bb' | 'donchian' | 'vwap' | 'rsi' | 'macd' | 'stoch' | 'adx' | 'obv';
export type Pane = 'price' | 'rsi' | 'macd' | 'stoch' | 'adx' | 'obv';
export type IndicatorDef = {
  id: IndicatorId; label: string; pane: Pane;
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
  ema9: { id: 'ema9', label: 'EMA 9', pane: 'price', signals: (c) => { const p = closes(c), m = ema(p, 9); return p.map((_, i) => cross(p, m, i)); } },
  sma20: { id: 'sma20', label: 'Média móvel 20', pane: 'price', signals: (c) => { const p = closes(c), m = sma(p, 20); return p.map((_, i) => cross(p, m, i)); } },
  sma50: { id: 'sma50', label: 'Média móvel 50', pane: 'price', signals: (c) => { const p = closes(c), m = sma(p, 50); return p.map((_, i) => cross(p, m, i)); } },
  sma200: { id: 'sma200', label: 'Média móvel 200', pane: 'price', signals: (c) => { const p = closes(c), m = sma(p, 200); return p.map((_, i) => cross(p, m, i)); } },
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
  donchian: { id: 'donchian', label: 'Canal de Donchian 20', pane: 'price', signals: (c) => {
    // rompimento: fecha acima da máxima (ou abaixo da mínima) dos 20 candles anteriores
    const d = donchian(c);
    return c.map((x, i) => (i < 1 || d.up[i - 1] === null ? 0 : x.close > d.up[i - 1]! ? 1 : x.close < d.lo[i - 1]! ? -1 : 0));
  } },
  vwap: { id: 'vwap', label: 'VWAP (dia)', pane: 'price', signals: (c) => { const p = closes(c), v = vwap(c); return p.map((_, i) => cross(p, v, i)); } },
  stoch: { id: 'stoch', label: 'Estocástico 14,3,3', pane: 'stoch', signals: (c) => {
    // %K cruza %D em sobrevenda (<20) = compra; em sobrecompra (>80) = venda
    const s = stochastic(c);
    return c.map((_, i) => { const x = cross(s.k, s.d, i); return x === 1 && (s.k[i] as number) < 20 ? 1 : x === -1 && (s.k[i] as number) > 80 ? -1 : 0; });
  } },
  adx: { id: 'adx', label: 'ADX 14 (+DI/-DI)', pane: 'adx', signals: (c) => {
    // +DI cruza -DI com tendência forte (ADX > 25)
    const a = adx(c);
    return c.map((_, i) => (a.adx[i] !== null && a.adx[i]! > 25 ? cross(a.plus, a.minus, i) : 0));
  } },
  obv: { id: 'obv', label: 'OBV', pane: 'obv', signals: (c) => { const o = obv(c), m = sma(o, 20); return o.map((_, i) => cross(o, m, i)); } },
};

export const INDICATOR_IDS = Object.keys(INDICATORS) as IndicatorId[];
