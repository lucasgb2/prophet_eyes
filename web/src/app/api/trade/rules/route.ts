import { NextResponse } from 'next/server';
import { symbolRules, ticker24h } from '@/lib/binance';
import { validSymbol } from '@/lib/markets';

export const dynamic = 'force-dynamic';

// Regras públicas do par (passo de quantidade, preço mínimo, valor mínimo) e último preço.
export async function GET(req: Request) {
  const symbol = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!validSymbol('binance', symbol)) return NextResponse.json({ error: 'símbolo inválido' }, { status: 400 });
  try {
    const [rules, t] = await Promise.all([symbolRules(symbol), ticker24h(symbol)]);
    return NextResponse.json({ rules, price: t.price });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 502 }); }
}
