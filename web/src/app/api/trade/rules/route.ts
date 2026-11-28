import { NextResponse } from 'next/server';
import { envOf, symbolRules, ticker24h } from '@/lib/binance';
import { validSymbol } from '@/lib/markets';

export const dynamic = 'force-dynamic';

// Regras públicas do par (passo de quantidade, preço mínimo, valor mínimo) e último preço.
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams, env = envOf(sp.get('env'));
  const symbol = (sp.get('symbol') ?? '').toUpperCase();
  if (!validSymbol('binance', symbol)) return NextResponse.json({ error: 'símbolo inválido' }, { status: 400 });
  try {
    const [rules, t] = await Promise.all([symbolRules(symbol, env), ticker24h(symbol, env)]);
    return NextResponse.json({ rules, price: t.price });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 502 }); }
}
