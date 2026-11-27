import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { marketOf, validSymbol } from '@/lib/markets';
import { CATEGORIES } from '@/lib/news/parse';
import { syncNews } from '@/lib/news/collect';

export const dynamic = 'force-dynamic';
const wrap = (fn: (req: Request) => Promise<Response>) => async (req: Request) => {
  try { return await fn(req); } catch (e) { if (e instanceof Response) return e; throw e; }
};
const bad = () => NextResponse.json({ error: 'parâmetros inválidos' }, { status: 400 });

export const GET = wrap(async (req) => {
  const uid = await requireUser();
  const sp = new URL(req.url).searchParams, market = marketOf(sp.get('market')), symbol = (sp.get('symbol') ?? '').toUpperCase();
  if (!market || !validSymbol(market, symbol)) return bad();
  await ensureSchema();
  const bell = (await pool.query('SELECT facts, categories FROM news_bells WHERE user_id=$1 AND market=$2 AND symbol=$3', [uid, market, symbol])).rows[0] ?? null;
  const u = (await pool.query('SELECT telegram_chat_id FROM users WHERE id=$1', [uid])).rows[0];
  return NextResponse.json({ bell, telegram: !!u?.telegram_chat_id });
});

// Liga/ajusta (bell = {facts, categories}) ou desliga (bell = null) o sino de um papel.
export const PUT = wrap(async (req) => {
  const uid = await requireUser();
  const b = await req.json().catch(() => ({}));
  const market = marketOf(b.market), symbol = String(b.symbol ?? '').toUpperCase();
  if (!market || !validSymbol(market, symbol)) return bad();
  await ensureSchema();
  if (!b.bell) {
    await pool.query('DELETE FROM news_bells WHERE user_id=$1 AND market=$2 AND symbol=$3', [uid, market, symbol]);
    return NextResponse.json({ ok: true });
  }
  const categories = Object.keys(CATEGORIES).filter((c) => Array.isArray(b.bell.categories) && b.bell.categories.includes(c));
  // coleta antes de marcar o "desde": o que já existe não vira enxurrada de avisos
  await syncNews(market, symbol).catch(() => {});
  await pool.query(
    `INSERT INTO news_bells(user_id,market,symbol,facts,categories) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id,market,symbol) DO UPDATE SET facts=EXCLUDED.facts, categories=EXCLUDED.categories, since=now()`,
    [uid, market, symbol, b.bell.facts === true, JSON.stringify(categories)]);
  return NextResponse.json({ ok: true });
});
