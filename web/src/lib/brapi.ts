import type { Candle, Timeframe } from './types';

// Timeframe -> parâmetros da brapi (intervalos intradiários têm janela máxima menor)
const MAP: Record<Timeframe, { interval: string; range: string }> = {
  '5m': { interval: '5m', range: '5d' },
  '15m': { interval: '15m', range: '5d' },
  '30m': { interval: '30m', range: '1mo' },
  '60m': { interval: '60m', range: '1mo' },
  '1d': { interval: '1d', range: '1y' },
  '1wk': { interval: '1wk', range: '5y' },
  '1mo': { interval: '1mo', range: 'max' },
};

export async function fetchCandles(symbol: string, tf: Timeframe): Promise<Candle[]> {
  const { interval, range } = MAP[tf];
  const url = new URL(`https://brapi.dev/api/quote/${encodeURIComponent(symbol.toUpperCase())}`);
  url.searchParams.set('interval', interval);
  url.searchParams.set('range', range);
  const headers: Record<string, string> = {};
  if (process.env.BRAPI_TOKEN) headers.Authorization = `Bearer ${process.env.BRAPI_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`brapi respondeu ${res.status}`);
  const json = await res.json();
  const rows: any[] = json?.results?.[0]?.historicalDataPrice ?? [];
  return rows
    .filter((r) => r.open != null && r.close != null)
    .map((r) => ({ time: r.date, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume ?? 0 }))
    .sort((a, b) => a.time - b.time);
}
