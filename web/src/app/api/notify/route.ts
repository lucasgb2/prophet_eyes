import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { validBells } from '@/lib/signal-watch';

export const dynamic = 'force-dynamic';
const wrap = (fn: (req: Request) => Promise<Response>) => async (req: Request) => {
  try { return await fn(req); } catch (e) { if (e instanceof Response) return e; throw e; }
};

// Sinos de indicadores do usuário (aviso no navegador e, se houver chat cadastrado, no Telegram pelo worker)
export const GET = wrap(async () => {
  const uid = await requireUser();
  await ensureSchema();
  const u = (await pool.query('SELECT signal_bells, telegram_chat_id FROM users WHERE id=$1', [uid])).rows[0];
  return NextResponse.json({ bells: validBells(u?.signal_bells), telegram: !!u?.telegram_chat_id });
});

export const PUT = wrap(async (req) => {
  const uid = await requireUser();
  const b = await req.json().catch(() => ({}));
  await ensureSchema();
  await pool.query('UPDATE users SET signal_bells=$1 WHERE id=$2', [JSON.stringify(validBells(b.bells)), uid]);
  return NextResponse.json({ ok: true });
});
