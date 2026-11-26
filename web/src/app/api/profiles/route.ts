import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { INDICATOR_IDS } from '@/lib/indicators';
import { TIMEFRAMES } from '@/lib/types';
import { ensureSchema } from '@/lib/schema';
import { MARKETS, marketOf, validSymbol } from '@/lib/markets';

const wrap = (fn: (req: Request) => Promise<Response>) => async (req: Request) => {
  try { return await fn(req); } catch (e) { if (e instanceof Response) return e; throw e; }
};

export const GET = wrap(async () => {
  const uid = await requireUser();
  await ensureSchema();
  const { rows } = await pool.query('SELECT id,name,market,symbol,timeframe,indicators FROM profiles WHERE user_id=$1 ORDER BY position,id', [uid]);
  return NextResponse.json(rows);
});

export const POST = wrap(async (req) => {
  const uid = await requireUser();
  await ensureSchema();
  const market = marketOf((await req.json().catch(() => ({})))?.market);
  if (!market) return NextResponse.json({ error: 'mercado inválido' }, { status: 400 });
  const sym = MARKETS[market].defaultSymbol;
  const { rows } = await pool.query('INSERT INTO profiles(user_id,name,market,symbol) VALUES ($1,$2,$3,$2) RETURNING id,name,market,symbol,timeframe,indicators', [uid, sym, market]);
  return NextResponse.json(rows[0]);
});

export const PUT = wrap(async (req) => {
  const uid = await requireUser();
  const p = await req.json();
  const inds = (Array.isArray(p.indicators) ? p.indicators : []).filter((i: string) => INDICATOR_IDS.includes(i as any));
  const market = marketOf(p.market);
  if (!market || typeof p.symbol !== 'string' || !validSymbol(market, p.symbol.toUpperCase()) || !TIMEFRAMES.includes(p.timeframe)) return NextResponse.json({ error: 'inválido' }, { status: 400 });
  await ensureSchema();
  await pool.query('UPDATE profiles SET name=$1,symbol=$1,market=$2,timeframe=$3,indicators=$4 WHERE id=$5 AND user_id=$6',
    [p.symbol.toUpperCase(), market, p.timeframe, JSON.stringify(inds), p.id, uid]);
  return NextResponse.json({ ok: true });
});

export const DELETE = wrap(async (req) => {
  const uid = await requireUser();
  const id = new URL(req.url).searchParams.get('id');
  await pool.query('DELETE FROM profiles WHERE id=$1 AND user_id=$2', [id, uid]);
  return NextResponse.json({ ok: true });
});
