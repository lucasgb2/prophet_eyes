import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getBalances, isEnv } from '@/lib/binance';
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
    return NextResponse.json(await getBalances(env, creds));
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 502 }); }
}
