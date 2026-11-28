import { NextResponse } from 'next/server';
import { marketOf, validSymbol } from '@/lib/markets';
import { envOf, ticker24h } from '@/lib/binance';

export const dynamic = 'force-dynamic';

// Preço ao vivo. B3: serviço yfinance (container `quotes`, só na rede do Compose). Binance: ticker público da própria Binance.
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const symbol = (sp.get('symbol') ?? '').toUpperCase();
  const market = marketOf(sp.get('market'));
  if (!market || !validSymbol(market, symbol)) return NextResponse.json({ error: 'parâmetros inválidos' }, { status: 400 });
  try {
    if (market === 'binance') return NextResponse.json(await ticker24h(symbol, envOf(sp.get('env'))));
    const r = await fetch(`${process.env.QUOTES_URL ?? 'http://quotes:8000'}/quote?symbol=${symbol}`, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    const body = await r.json();
    return NextResponse.json(body, { status: r.ok ? 200 : 502 });
  } catch {
    return NextResponse.json({ error: 'serviço de cotação indisponível' }, { status: 502 });
  }
}
