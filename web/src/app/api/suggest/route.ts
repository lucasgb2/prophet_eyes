import { NextResponse } from 'next/server';
import { fetchCandles } from '@/lib/brapi';
import { suggestIndicators } from '@/lib/suggest';
import { TIMEFRAMES, type Timeframe } from '@/lib/types';

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const symbol = (sp.get('symbol') ?? '').toUpperCase();
  const tf = sp.get('tf') as Timeframe;
  if (!/^[A-Z0-9]{4,8}$/.test(symbol) || !TIMEFRAMES.includes(tf)) return NextResponse.json({ error: 'parâmetros inválidos' }, { status: 400 });
  try { return NextResponse.json(suggestIndicators(await fetchCandles(symbol, tf))); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 502 }); }
}
