import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { pool } from '@/lib/db';
import { ensureSchema } from '@/lib/schema';
import { getCandles } from '@/lib/candles';
import { marketOf, validSymbol } from '@/lib/markets';
import { TIMEFRAMES, type Timeframe } from '@/lib/types';
import { syncNews } from '@/lib/news/collect';
import { reactionFor, statsByCategory } from '@/lib/news/reaction';

export const dynamic = 'force-dynamic';

const SELECT = `SELECT url, title, source, source_url AS "sourceUrl", kind, category, date_only AS "dateOnly", extract(epoch FROM published_at)::bigint AS "publishedAt"
  FROM news WHERE market=$1 AND symbol=$2 AND published_at <= now() + interval '1 day' ORDER BY published_at DESC LIMIT $3`;

// Notícias do mercado e do papel, com a reação do preço do papel no timeframe pedido.
export async function GET(req: Request) {
  try { await requireUser(); } catch (e) { if (e instanceof Response) return e; throw e; }
  const sp = new URL(req.url).searchParams;
  const market = marketOf(sp.get('market')), symbol = (sp.get('symbol') ?? '').toUpperCase(), tf = sp.get('tf') as Timeframe;
  if (!market || !validSymbol(market, symbol) || !TIMEFRAMES.includes(tf)) return NextResponse.json({ error: 'parâmetros inválidos' }, { status: 400 });
  await ensureSchema();
  const errors = (await Promise.allSettled([syncNews(market, ''), syncNews(market, symbol)]))
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : [String(r.reason?.message ?? r.reason)]));
  const rows = async (s: string, n: number) => (await pool.query(SELECT, [market, s, n])).rows.map((r) => ({ ...r, publishedAt: Number(r.publishedAt) }));
  const [general, own, candles] = await Promise.all([
    rows('', 60), rows(symbol, 600),
    getCandles(symbol, tf, market).then((r) => r.candles).catch((e) => { errors.push(`preços: ${e.message}`); return []; }),
  ]);
  const withReaction = own.map((n) => ({ ...n, reaction: reactionFor(candles, tf, market, n.publishedAt, n.dateOnly) }));
  return NextResponse.json({ market: general, symbol: withReaction.slice(0, 80), stats: statsByCategory(withReaction), total: own.length, errors: [...new Set(errors)] });
}
