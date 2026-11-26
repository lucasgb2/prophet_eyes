import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { TIMEFRAMES } from '@/lib/types';
import { ensureSchema } from '@/lib/schema';
import { marketOf, validSymbol } from '@/lib/markets';

const KINDS = ['price_above', 'price_below', 'rsi_above', 'rsi_below'];
const wrap = (fn: (req: Request) => Promise<Response>) => async (req: Request) => {
  try { return await fn(req); } catch (e) { if (e instanceof Response) return e; throw e; }
};

// Também guarda o chat_id do Telegram do usuário (PUT)
export const GET = wrap(async () => {
  const uid = await requireUser();
  await ensureSchema();
  const alerts = (await pool.query('SELECT id,market,symbol,timeframe,kind,value,active FROM alerts WHERE user_id=$1 ORDER BY id', [uid])).rows;
  const u = (await pool.query('SELECT telegram_chat_id FROM users WHERE id=$1', [uid])).rows[0];
  return NextResponse.json({ alerts, telegramChatId: u?.telegram_chat_id ?? null });
});

export const POST = wrap(async (req) => {
  const uid = await requireUser();
  const a = await req.json();
  const market = marketOf(a.market);
  if (!market || !KINDS.includes(a.kind) || !TIMEFRAMES.includes(a.timeframe) || typeof a.symbol !== 'string' || !validSymbol(market, a.symbol.toUpperCase()) || !Number.isFinite(Number(a.value)))
    return NextResponse.json({ error: 'inválido' }, { status: 400 });
  await ensureSchema();
  await pool.query('INSERT INTO alerts(user_id,market,symbol,timeframe,kind,value) VALUES ($1,$2,$3,$4,$5,$6)', [uid, market, a.symbol.toUpperCase(), a.timeframe, a.kind, Number(a.value)]);
  return NextResponse.json({ ok: true });
});

export const PUT = wrap(async (req) => {
  const uid = await requireUser();
  const { telegramChatId } = await req.json();
  await pool.query('UPDATE users SET telegram_chat_id=$1 WHERE id=$2', [telegramChatId ? String(telegramChatId).slice(0, 32) : null, uid]);
  return NextResponse.json({ ok: true });
});

export const DELETE = wrap(async (req) => {
  const uid = await requireUser();
  await pool.query('DELETE FROM alerts WHERE id=$1 AND user_id=$2', [new URL(req.url).searchParams.get('id'), uid]);
  return NextResponse.json({ ok: true });
});
