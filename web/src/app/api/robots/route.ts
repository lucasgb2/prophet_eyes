import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { getCandles } from '@/lib/candles';
import { INDICATOR_IDS } from '@/lib/indicators';
import { marketOf, validSymbol } from '@/lib/markets';
import { envOf } from '@/lib/binance';
import { TIMEFRAMES } from '@/lib/types';
import { closedCount } from '@/lib/journal';
import { initialState, stopRobot } from '@/lib/robot';
import { getRobot, listRobots } from '@/lib/robot-store';

export const dynamic = 'force-dynamic';

const MAX_ROBOTS = 20;
const wrap = (fn: (req: Request, uid: number) => Promise<Response>) => async (req: Request) => {
  try { const uid = await requireUser(); await ensureSchema(); return await fn(req, uid); } catch (e) { if (e instanceof Response) return e; throw e; }
};
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
const pos = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;

export const GET = wrap(async (_req, uid) => NextResponse.json(await listRobots(uid)));

export const POST = wrap(async (req, uid) => {
  const b = await req.json().catch(() => ({}));
  const market = marketOf(b.market), symbol = String(b.symbol ?? '').toUpperCase();
  if (!market || !validSymbol(market, symbol) || !TIMEFRAMES.includes(b.timeframe) || !INDICATOR_IDS.includes(b.indicator)) return bad('papel, timeframe ou indicador inválido');
  if (!pos(b.capital)) return bad('informe o valor a simular');
  const stopPct = b.stopPct ?? null, gainPct = b.gainPct ?? null;
  if (stopPct != null && (!pos(stopPct) || stopPct >= 100)) return bad('stop loss % inválido');
  if (gainPct != null && !pos(gainPct)) return bad('stop gain % inválido');
  const count = (await pool.query('SELECT count(*)::int AS n FROM robots WHERE user_id=$1', [uid])).rows[0].n;
  if (count >= MAX_ROBOTS) return bad(`Você já tem ${MAX_ROBOTS} robôs: exclua algum.`);
  const env = market === 'binance' ? envOf(b.env) : 'production';
  let candles;
  try { candles = (await getCandles(symbol, b.timeframe, market, env)).candles; } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 502 }); }
  const ref = candles[closedCount(candles, b.timeframe, market) - 1];
  if (!ref) return bad('sem candles para este papel');
  const last = candles.at(-1)!;
  if (market === 'b3' && b.capital < last.close) return bad('o valor não compra nem uma ação deste papel');
  await pool.query(
    `INSERT INTO robots(user_id,market,env,symbol,timeframe,indicator,capital,stop_pct,gain_pct,step,state) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [uid, market, env, symbol, b.timeframe, b.indicator, b.capital, stopPct, gainPct, market === 'b3' ? 1 : 0.00001, JSON.stringify(initialState(b.capital, ref.time))]);
  return NextResponse.json({ ok: true });
});

/** Parar um robô (vende a posição simulada pelo último preço). */
export const PATCH = wrap(async (req, uid) => {
  const b = await req.json().catch(() => ({}));
  const r = Number.isInteger(b.id) ? await getRobot(uid, b.id) : null;
  if (!r || r.status !== 'running') return bad('robô não encontrado');
  await pool.query(`UPDATE robots SET status='stopped', stopped_at=now(), state=$3 WHERE id=$1 AND user_id=$2`,
    [r.id, uid, JSON.stringify(stopRobot(r.state, Math.floor(Date.now() / 1000)))]);
  return NextResponse.json({ ok: true });
});

export const DELETE = wrap(async (req, uid) => {
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isInteger(id)) return bad('robô inválido');
  await pool.query('DELETE FROM robots WHERE id=$1 AND user_id=$2', [id, uid]);
  return NextResponse.json({ ok: true });
});
