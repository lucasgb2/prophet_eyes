import { pool } from './db';
import { getCandles } from './candles';
import { INDICATORS } from './indicators';
import { closedCount } from './journal';
import { advance, type Robot, type RobotEvent } from './robot';

const COLUMNS = `id, user_id AS "userId", market, env, symbol, timeframe, indicator, capital, stop_pct AS "stopPct", gain_pct AS "gainPct", step, status, state,
  extract(epoch from created_at)::float8 AS "createdAt", extract(epoch from stopped_at)::float8 AS "stoppedAt"`;

type Row = Robot & { userId: number; step: number };

export async function listRobots(userId: number): Promise<Robot[]> {
  return (await pool.query(`SELECT ${COLUMNS} FROM robots WHERE user_id=$1 ORDER BY status, created_at DESC`, [userId])).rows;
}
export async function getRobot(userId: number, id: number): Promise<Row | null> {
  return (await pool.query(`SELECT ${COLUMNS} FROM robots WHERE user_id=$1 AND id=$2`, [userId, id])).rows[0] ?? null;
}

/** Avança os robôs ligados. Só o worker chama (um único escritor), e `notify` recebe cada compra e venda. */
export async function runRobots(notify: (userId: number, robot: Robot, event: RobotEvent) => Promise<void>): Promise<void> {
  const rows: Row[] = (await pool.query(`SELECT ${COLUMNS} FROM robots WHERE status='running'`)).rows;
  const cache = new Map<string, Promise<Awaited<ReturnType<typeof getCandles>> | null>>();
  for (const r of rows) {
    try {
      const key = `${r.market}|${r.env}|${r.symbol}|${r.timeframe}`;
      if (!cache.has(key)) cache.set(key, getCandles(r.symbol, r.timeframe, r.market, r.env).catch((e) => { console.error('robô', key, e.message); return null; }));
      const data = await cache.get(key)!;
      if (!data || data.stale || !data.candles.length) continue; // com dado velho um candle pela metade pareceria fechado
      const { state, events } = advance(r.state, data.candles, closedCount(data.candles, r.timeframe, r.market), INDICATORS[r.indicator].signals(data.candles), r);
      // grava antes de avisar: um aviso perdido é melhor que repetido. Parado nesse meio tempo não volta.
      const saved = await pool.query(`UPDATE robots SET state=$2 WHERE id=$1 AND status='running'`, [r.id, JSON.stringify(state)]);
      if (saved.rowCount) for (const e of events) await notify(r.userId, r, e).catch((err) => console.error('robô aviso', r.id, err.message));
    } catch (e) { console.error('robô', r.id, e); }
  }
}
