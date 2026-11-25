import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { INDICATOR_IDS } from '@/lib/indicators';
import { TIMEFRAMES } from '@/lib/types';

const wrap = (fn: (req: Request) => Promise<Response>) => async (req: Request) => {
  try { return await fn(req); } catch (e) { if (e instanceof Response) return e; throw e; }
};

export const GET = wrap(async () => {
  const uid = await requireUser();
  const { rows } = await pool.query('SELECT id,name,symbol,timeframe,indicators FROM profiles WHERE user_id=$1 ORDER BY position,id', [uid]);
  return NextResponse.json(rows);
});

export const POST = wrap(async (req) => {
  const uid = await requireUser();
  const { name } = await req.json();
  const { rows } = await pool.query("INSERT INTO profiles(user_id,name) VALUES ($1,$2) RETURNING id,name,symbol,timeframe,indicators", [uid, String(name || 'Nova aba').slice(0, 40)]);
  return NextResponse.json(rows[0]);
});

export const PUT = wrap(async (req) => {
  const uid = await requireUser();
  const p = await req.json();
  const inds = (Array.isArray(p.indicators) ? p.indicators : []).filter((i: string) => INDICATOR_IDS.includes(i as any));
  if (!/^[A-Za-z0-9]{4,8}$/.test(p.symbol) || !TIMEFRAMES.includes(p.timeframe)) return NextResponse.json({ error: 'inválido' }, { status: 400 });
  await pool.query('UPDATE profiles SET name=$1,symbol=$2,timeframe=$3,indicators=$4 WHERE id=$5 AND user_id=$6',
    [String(p.name).slice(0, 40), p.symbol.toUpperCase(), p.timeframe, JSON.stringify(inds), p.id, uid]);
  return NextResponse.json({ ok: true });
});

export const DELETE = wrap(async (req) => {
  const uid = await requireUser();
  const id = new URL(req.url).searchParams.get('id');
  await pool.query('DELETE FROM profiles WHERE id=$1 AND user_id=$2', [id, uid]);
  return NextResponse.json({ ok: true });
});
