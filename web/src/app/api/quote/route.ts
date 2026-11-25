import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Preço "real" via serviço yfinance (container `quotes`), só acessível dentro da rede do Compose.
export async function GET(req: Request) {
  const symbol = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(symbol)) return NextResponse.json({ error: 'parâmetros inválidos' }, { status: 400 });
  try {
    const r = await fetch(`${process.env.QUOTES_URL ?? 'http://quotes:8000'}/quote?symbol=${symbol}`, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    const body = await r.json();
    return NextResponse.json(body, { status: r.ok ? 200 : 502 });
  } catch {
    return NextResponse.json({ error: 'serviço de cotação indisponível' }, { status: 502 });
  }
}
