import { pool } from './db';
import { ensureSchema } from './schema';
import { INITIAL_RANGE } from './ranges';
import { fetchCandles } from './brapi';
import { pickRange } from './ranges';
import type { Candle, Timeframe } from './types';

const FRESH_MS: Record<Timeframe, number> = { '1m': 30_000, '5m': 60_000, '15m': 60_000, '30m': 60_000, '60m': 60_000, '1d': 300_000, '1wk': 300_000, '1mo': 300_000 };
const MAX_ROWS = 5000;

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

/**
 * Candles com cache no Postgres. Se o cache está fresco, não chama a brapi; se está velho,
 * busca só o trecho desde o último candle guardado (o último é reescrito, pois pode ainda estar em formação).
 * Se a brapi falhar mas houver cache, devolve o cache (stale).
 */
export async function getCandles(symbolRaw: string, tf: Timeframe): Promise<{ candles: Candle[]; stale: boolean }> {
  await ensureSchema();
  const symbol = symbolRaw.toUpperCase();
  const cached = await readCache(symbol, tf);
  const sync = (await pool.query(
    "SELECT (extract(epoch from now()-synced_at)*1000)::float8 AS age FROM candle_sync WHERE symbol=$1 AND timeframe=$2", [symbol, tf])).rows[0];
  if (cached.length && sync && sync.age < FRESH_MS[tf]) return { candles: cached, stale: false };

  try {
    const range = pickRange(tf, cached.length ? cached[cached.length - 1].time : null);
    let fresh: Candle[];
    try { fresh = await fetchCandles(symbol, tf, range); }
    catch (e: any) {
      // 400 num trecho incremental: tenta a janela inicial do timeframe antes de desistir
      if (e?.status === 400 && range !== INITIAL_RANGE[tf].range) fresh = await fetchCandles(symbol, tf);
      else throw e;
    }
    await upsert(symbol, tf, fresh);
    await pool.query(
      `INSERT INTO candle_sync(symbol,timeframe) VALUES ($1,$2)
       ON CONFLICT (symbol,timeframe) DO UPDATE SET synced_at=now()`, [symbol, tf]);
    return { candles: await readCache(symbol, tf), stale: false };
  } catch (e) {
    if (cached.length) return { candles: cached, stale: true };
    throw e;
  }
}
