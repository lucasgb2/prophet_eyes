import { pool } from './db';
import { ensureSchema } from './schema';
import { fetchCandles } from './brapi';
import { fetchKlines, type Env } from './binance';
import { MARKETS, cacheSymbol, type MarketId } from './markets';
import { INITIAL_RANGE, firstGapStart, pickRange } from './ranges';
import { needsRefresh } from './market';
import type { Candle, Timeframe } from './types';

const MAX_ROWS = 5000;
const GAP_RECHECK_SEC = 86400; // tenta preencher lacunas no máximo uma vez por dia por papel/timeframe

async function readCache(symbol: string, tf: Timeframe): Promise<Candle[]> {
  const { rows } = await pool.query(
    `SELECT extract(epoch from ts)::float8 AS time, open, high, low, close, volume
       FROM candles WHERE symbol=$1 AND timeframe=$2 ORDER BY ts DESC LIMIT ${MAX_ROWS}`, [symbol, tf]);
  return rows.reverse();
}

async function upsert(symbol: string, tf: Timeframe, c: Candle[]) {
  if (!c.length) return;
  const col = (k: keyof Candle) => c.map((x) => x[k]);
  await pool.query(
    `INSERT INTO candles(symbol,timeframe,ts,open,high,low,close,volume)
     SELECT $1,$2,to_timestamp(t),o,h,l,c,v
       FROM unnest($3::float8[],$4::float8[],$5::float8[],$6::float8[],$7::float8[],$8::float8[]) AS x(t,o,h,l,c,v)
     ON CONFLICT (symbol,timeframe,ts) DO UPDATE
       SET open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low, close=EXCLUDED.close, volume=EXCLUDED.volume`,
    [symbol, tf, col('time'), col('open'), col('high'), col('low'), col('close'), col('volume')]);
}

type Result = { candles: Candle[]; stale: boolean };
const inflight = new Map<string, Promise<Result>>(); // uma busca por vez por papel/timeframe (candles e suggest chegam juntos)

/**
 * Candles com histórico próprio no Postgres. A brapi só é chamada quando precisa:
 * - mercado aberto: cache mais velho que o prazo do timeframe;
 * - mercado fechado: só se ainda falta o fechamento do último pregão (ver lib/market.ts);
 * e sempre pedindo só o trecho desde o último candle guardado (ou desde uma lacuna, uma vez por dia).
 * Se a brapi falhar mas houver cache, devolve o cache (stale).
 */
export function getCandles(symbolRaw: string, tf: Timeframe, market: MarketId = 'b3', env: Env = 'production'): Promise<Result> {
  const symbol = symbolRaw.toUpperCase();
  const key = `${market}|${env}|${symbol}|${tf}`;
  let p = inflight.get(key);
  if (!p) {
    p = load(symbol, tf, market, env).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

async function load(sym: string, tf: Timeframe, market: MarketId, env: Env): Promise<Result> {
  await ensureSchema();
  const symbol = cacheSymbol(market, sym, env === 'testnet'); // chave no banco (B3: código puro; Binance: BINANCE:BTCUSDT)
  const cached = await readCache(symbol, tf);
  const sync = (await pool.query(
    `SELECT extract(epoch from synced_at)::float8 AS synced,
            extract(epoch from now()-gap_checked_at)::float8 AS gap_age
       FROM candle_sync WHERE symbol=$1 AND timeframe=$2`, [symbol, tf])).rows[0];
  if (cached.length && sync && !needsRefresh(tf, sync.synced, undefined, MARKETS[market].alwaysOpen)) return { candles: cached, stale: false };

  try {
    const last = cached.length ? cached[cached.length - 1].time : null;
    const gap = cached.length && (sync?.gap_age == null || sync.gap_age > GAP_RECHECK_SEC) ? firstGapStart(cached.map((c) => c.time), tf) : null;
    const from = last == null ? null : gap != null ? Math.min(last, gap) : last;
    let fresh: Candle[];
    if (market === 'binance') fresh = await fetchKlines(sym, tf, { fromSec: from, env });
    else {
      const range = pickRange(tf, from);
      try { fresh = await fetchCandles(sym, tf, range); }
      catch (e: any) {
        // 400 num trecho incremental: tenta a janela inicial do timeframe antes de desistir
        if (e?.status === 400 && range !== INITIAL_RANGE[tf].range) fresh = await fetchCandles(sym, tf);
        else throw e;
      }
    }
    await upsert(symbol, tf, fresh);
    await pool.query(
      `INSERT INTO candle_sync(symbol,timeframe,gap_checked_at) VALUES ($1,$2,now())
       ON CONFLICT (symbol,timeframe) DO UPDATE SET synced_at=now(),
         gap_checked_at = CASE WHEN $3 THEN now() ELSE candle_sync.gap_checked_at END`,
      [symbol, tf, gap != null || !cached.length]);
    return { candles: await readCache(symbol, tf), stale: false };
  } catch (e) {
    if (cached.length) return { candles: cached, stale: true };
    throw e;
  }
}
