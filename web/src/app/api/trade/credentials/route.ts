import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { cryptoReady } from '@/lib/crypto-box';
import { getBalances, isEnv } from '@/lib/binance';
import { maxNotional, productionAllowed, saveCreds } from '@/lib/trade-guard';

export const dynamic = 'force-dynamic';
const wrap = (fn: (req: Request) => Promise<Response>) => async (req: Request) => {
  try { return await fn(req); } catch (e) { if (e instanceof Response) return e; throw e; }
};
const mask = (k: string) => `…${k.slice(-4)}`;

// Estado das conexões. Nunca devolve o segredo; da chave só os 4 últimos caracteres.
export const GET = wrap(async () => {
  const uid = await requireUser();
  await ensureSchema();
  const rows = (await pool.query("SELECT env, api_key FROM exchange_credentials WHERE user_id=$1 AND exchange='binance'", [uid])).rows;
  const by = (env: string) => { const r = rows.find((x) => x.env === env); return r ? { configured: true, apiKey: mask(r.api_key) } : { configured: false }; };
  return NextResponse.json({ testnet: by('testnet'), production: by('production'), productionAllowed: productionAllowed(), maxNotionalUsdt: maxNotional(), cryptoReady: cryptoReady() });
});

// Salva as chaves só depois de provar que funcionam (consulta de saldo, somente leitura).
export const PUT = wrap(async (req) => {
  const uid = await requireUser();
  const b = await req.json().catch(() => ({}));
  const apiKey = String(b.apiKey ?? '').trim(), apiSecret = String(b.apiSecret ?? '').trim();
  if (!isEnv(b.env)) return NextResponse.json({ error: 'ambiente inválido' }, { status: 400 });
  if (!cryptoReady()) return NextResponse.json({ error: 'O servidor não tem CREDENTIALS_KEY configurada; as chaves não podem ser guardadas.' }, { status: 503 });
  if (!/^[A-Za-z0-9]{20,128}$/.test(apiKey) || !/^[A-Za-z0-9]{20,128}$/.test(apiSecret))
    return NextResponse.json({ error: 'Chave ou segredo em formato inválido (só chaves HMAC são aceitas).' }, { status: 400 });
  try { await getBalances(b.env, { apiKey, apiSecret }); }
  catch (e: any) { return NextResponse.json({ error: `A Binance recusou estas chaves: ${e.message}` }, { status: 400 }); }
  await saveCreds(uid, b.env, { apiKey, apiSecret });
  return NextResponse.json({ ok: true, apiKey: mask(apiKey) });
});

export const DELETE = wrap(async (req) => {
  const uid = await requireUser();
  const env = new URL(req.url).searchParams.get('env');
  if (!isEnv(env)) return NextResponse.json({ error: 'ambiente inválido' }, { status: 400 });
  await pool.query("DELETE FROM exchange_credentials WHERE user_id=$1 AND exchange='binance' AND env=$2", [uid, env]);
  return NextResponse.json({ ok: true });
});
