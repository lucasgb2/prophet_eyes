import { pool } from './db';
import { getCandles } from './candles';
import { INDICATORS, type IndicatorId } from './indicators';
import { closedCount, track, type Entry } from './journal';

const COLUMNS = `id, kind, market, env, symbol, timeframe, indicator, exit_rule AS "exitRule", stop_loss AS "stopLoss", stop_gain AS "stopGain",
  capital, risk_pct AS "riskPct", note, status, reason, signal_time AS "signalTime", entry_time AS "entryTime", entry_price AS "entryPrice",
  qty, exit_time AS "exitTime", exit_price AS "exitPrice", last_price AS "lastPrice", extract(epoch from created_at)::float8 AS "createdAt"`;

export async function listEntries(userId: number): Promise<Entry[]> {
  return (await pool.query(`SELECT ${COLUMNS} FROM journal WHERE user_id=$1 ORDER BY created_at DESC, id DESC`, [userId])).rows;
}

/** Avança os cenários de teste ainda vivos (de um usuário, ou de todos). Encerrados não são recalculados. */
export async function refreshJournal(userId?: number): Promise<void> {
  const { rows } = await pool.query(
    `SELECT id, market, env, symbol, timeframe, indicator, ref_time AS "refTime", stop_loss AS "stopLoss", stop_gain AS "stopGain",
            exit_rule AS "exitRule", capital, risk_pct AS "riskPct", step
       FROM journal WHERE kind='test' AND status IN ('waiting','open') AND ($1::int IS NULL OR user_id=$1)`, [userId ?? null]);
  const cache = new Map<string, Promise<Awaited<ReturnType<typeof getCandles>> | null>>();
  for (const e of rows) {
    const key = `${e.market}|${e.env}|${e.symbol}|${e.timeframe}`;
    if (!cache.has(key)) cache.set(key, getCandles(e.symbol, e.timeframe, e.market, e.env).catch((err) => { console.error('diário', key, err.message); return null; }));
    const data = await cache.get(key)!;
    // com dado velho um candle pela metade pareceria fechado: espera atualizar
    if (!data || data.stale || !data.candles.length || !(e.indicator in INDICATORS)) continue;
    const p = track(data.candles, closedCount(data.candles, e.timeframe, e.market), INDICATORS[e.indicator as IndicatorId].signals(data.candles), e);
    await pool.query(
      `UPDATE journal SET status=$2, reason=$3, signal_time=$4, entry_time=$5, entry_price=$6, qty=$7, exit_time=$8, exit_price=$9, last_price=$10
        WHERE id=$1 AND status IN ('waiting','open')`,
      [e.id, p.status, p.reason, p.signalTime, p.entryTime, p.entryPrice, p.qty, p.exitTime, p.exitPrice, data.candles.at(-1)!.close]);
  }
}
