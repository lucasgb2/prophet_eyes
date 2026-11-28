import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getCandles } from '@/lib/candles';
import { walkForward, WARMUP } from '@/lib/validate';
import { closedCount } from '@/lib/journal';
import { marketOf, validSymbol } from '@/lib/markets';
import { envOf } from '@/lib/binance';
import { TIMEFRAMES, type Timeframe } from '@/lib/types';

export const dynamic = 'force-dynamic';
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET(req: Request) {
  try { await requireUser(); } catch (e) { if (e instanceof Response) return e; throw e; }
  const sp = new URL(req.url).searchParams;
  const symbol = (sp.get('symbol') ?? '').toUpperCase(), tf = sp.get('tf') as Timeframe, market = marketOf(sp.get('market'));
  if (!market || !validSymbol(market, symbol) || !TIMEFRAMES.includes(tf)) return bad('parâmetros inválidos');
  const pct = (name: string) => { const v = sp.get(name); if (!v) return null; const n = Number(v); return Number.isFinite(n) && n >= 0 && n < 100 ? n : NaN; };
  const stopPct = pct('stop'), gainPct = pct('gain'), slipPct = pct('slip') ?? 0;
  if (Number.isNaN(stopPct) || Number.isNaN(gainPct) || Number.isNaN(slipPct) || slipPct > 5) return bad('percentual inválido');
  try {
    const { candles } = await getCandles(symbol, tf, market, envOf(sp.get('env')));
    const closed = candles.slice(0, closedCount(candles, tf, market, Math.floor(Date.now() / 1000)));
    const report = walkForward(closed, { stopPct, gainPct, slipPct });
    if (!report) return bad(`Histórico insuficiente: há ${closed.length} candles fechados e o teste precisa de pelo menos ${WARMUP + 240}.`, 422);
    return NextResponse.json(report);
  } catch (e: any) { return bad(e.message, 502); }
}
