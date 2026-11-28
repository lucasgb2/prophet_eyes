import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { brlValues, getBalances, isEnv } from '@/lib/binance';
import { loadCreds } from '@/lib/trade-guard';

export const dynamic = 'force-dynamic';

// Saldos (somente leitura; liberado também em produção mesmo com ordens desabilitadas).
export async function GET(req: Request) {
  let uid: number;
  try { uid = await requireUser(); } catch (e) { if (e instanceof Response) return e; throw e; }
  const env = new URL(req.url).searchParams.get('env');
  if (!isEnv(env)) return NextResponse.json({ error: 'ambiente inválido' }, { status: 400 });
  try {
    const creds = await loadCreds(uid, env);
    if (!creds) return NextResponse.json({ error: 'Sem chaves configuradas para este ambiente.' }, { status: 404 });
    const acc = await getBalances(env, creds);
    // valor em reais é um extra: se a consulta de preços falhar, o saldo continua sendo mostrado
    const rates = await brlValues(acc.balances.map((b) => b.asset), env).catch(() => ({} as Record<string, number | null>));
    const balances = acc.balances.map((b) => { const r = rates[b.asset]; return { ...b, brl: r == null ? null : (Number(b.free) + Number(b.locked)) * r }; });
    const totalBrl = balances.some((b) => b.brl != null) ? balances.reduce((t, b) => t + (b.brl ?? 0), 0) : null;
    return NextResponse.json({ ...acc, balances, totalBrl });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 502 }); }
}
