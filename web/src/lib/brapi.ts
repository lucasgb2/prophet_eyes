import type { Candle, Timeframe } from './types';
import { INITIAL_RANGE, clampRange, parseAllowedRanges } from './ranges';

// Ranges liberados pelo plano da brapi: vem de BRAPI_RANGES ou é aprendido da mensagem de erro (400).
let allowedRanges: string[] | null = parseAllowedRanges(process.env.BRAPI_RANGES ?? '');

function headers() {
  const h: Record<string, string> = {};
  if (process.env.BRAPI_TOKEN) h.Authorization = `Bearer ${process.env.BRAPI_TOKEN}`;
  return h;
}

async function fail(res: Response): Promise<never> {
  let msg = '';
  try { msg = (await res.json())?.message ?? ''; } catch {}
  const err: any = new Error(`brapi respondeu ${res.status}${msg ? `: ${msg}` : ''}`);
  err.status = res.status;
  throw err;
}

/** Busca candles na brapi. `range` permite pedir só o trecho recente (ver lib/candles.ts). */
export async function fetchCandles(symbol: string, tf: Timeframe, range?: string): Promise<Candle[]> {
  const url = new URL(`https://brapi.dev/api/quote/${encodeURIComponent(symbol.toUpperCase())}`);
  url.searchParams.set('interval', INITIAL_RANGE[tf].interval);
  const want = range ?? INITIAL_RANGE[tf].range;
  url.searchParams.set('range', clampRange(want, allowedRanges));
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    try { await fail(res); }
    catch (e: any) {
      // plano limitado: guarda os ranges permitidos e repete uma vez com o maior que cabe
      const learned = e?.status === 400 ? parseAllowedRanges(String(e.message)) : null;
      if (learned && !allowedRanges) { allowedRanges = learned; return fetchCandles(symbol, tf, want); }
      throw e;
    }
  }
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
  if (!res.ok) await fail(res);
  const json = await res.json();
  return (json?.stocks ?? [])
    .filter((s: any) => typeof s.stock === 'string' && /^[A-Z0-9]{4,8}$/.test(s.stock))
    .map((s: any) => ({ symbol: s.stock, name: String(s.name ?? s.stock) }));
}
