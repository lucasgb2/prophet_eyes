import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getCandles } from '@/lib/candles';
import { TIMEFRAMES, type Timeframe } from '@/lib/types';
import { marketOf, validSymbol } from '@/lib/markets';

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const symbol = (sp.get('symbol') ?? '').toUpperCase();
  const tf = sp.get('tf') as Timeframe;
  const market = marketOf(sp.get('market'));
  if (!market || !validSymbol(market, symbol) || !TIMEFRAMES.includes(tf)) return NextResponse.json({ error: 'parâmetros inválidos' }, { status: 400 });
  try {
    const { candles, stale } = await getCandles(symbol, tf, market);
    return NextResponse.json(candles, { headers: { 'x-cache-stale': String(stale) } });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 502 }); }
}
