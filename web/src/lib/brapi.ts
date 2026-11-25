import type { Candle, Timeframe } from './types';
import { INITIAL_RANGE } from './ranges';

function headers() {
  const h: Record<string, string> = {};
  if (process.env.BRAPI_TOKEN) h.Authorization = `Bearer ${process.env.BRAPI_TOKEN}`;
  return h;
}

/** Busca candles na brapi. `range` permite pedir só o trecho recente (ver lib/candles.ts). */
export async function fetchCandles(symbol: string, tf: Timeframe, range?: string): Promise<Candle[]> {
  const url = new URL(`https://brapi.dev/api/quote/${encodeURIComponent(symbol.toUpperCase())}`);
  url.searchParams.set('interval', INITIAL_RANGE[tf].interval);
  url.searchParams.set('range', range ?? INITIAL_RANGE[tf].range);
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`brapi respondeu ${res.status}`);
  const json = await res.json();
  const rows: any[] = json?.results?.[0]?.historicalDataPrice ?? [];
  return rows
    .filter((r) => r.open != null && r.close != null)
    .map((r) => ({ time: r.date, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume ?? 0 }))
    .sort((a, b) => a.time - b.time);
}

export async function searchAssets(q: string): Promise<{ symbol: string; name: string }[]> {
  const url = new URL('https://brapi.dev/api/quote/list');
  url.searchParams.set('search', q);
  url.searchParams.set('limit', '10');
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`brapi respondeu ${res.status}`);
  const json = await res.json();
  return (json?.stocks ?? [])
    .filter((s: any) => typeof s.stock === 'string' && /^[A-Z0-9]{4,8}$/.test(s.stock))
    .map((s: any) => ({ symbol: s.stock, name: String(s.name ?? s.stock) }));
}
