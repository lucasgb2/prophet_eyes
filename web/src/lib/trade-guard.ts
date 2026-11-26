import { pool } from './db';
import { ensureSchema } from './schema';
import { open, seal } from './crypto-box';
import type { Creds, Env } from './binance';

/** Travas de segurança das operações. Tudo configurável por variável de ambiente (ver .env.example). */
export const productionAllowed = () => process.env.BINANCE_ALLOW_PRODUCTION === 'true';
export const maxNotional = () => { const n = Number(process.env.TRADE_MAX_NOTIONAL_USDT ?? '100'); return Number.isFinite(n) && n > 0 ? n : 100; };

export async function loadCreds(userId: number, env: Env): Promise<Creds | null> {
  await ensureSchema();
  const r = (await pool.query("SELECT api_key, secret_enc FROM exchange_credentials WHERE user_id=$1 AND exchange='binance' AND env=$2", [userId, env])).rows[0];
  return r ? { apiKey: r.api_key, apiSecret: open(r.secret_enc) } : null;
}

export async function saveCreds(userId: number, env: Env, c: Creds) {
  await ensureSchema();
  await pool.query(
    `INSERT INTO exchange_credentials(user_id,exchange,env,api_key,secret_enc) VALUES ($1,'binance',$2,$3,$4)
     ON CONFLICT (user_id,exchange,env) DO UPDATE SET api_key=EXCLUDED.api_key, secret_enc=EXCLUDED.secret_enc, created_at=now()`,
    [userId, env, c.apiKey, seal(c.apiSecret)]);
}

export async function logOrder(userId: number, env: Env, o: { symbol: string; side: string; type: string; quantity?: string; price?: string }, mode: 'test' | 'live', ok: boolean, result: unknown) {
  await ensureSchema();
  await pool.query(
    'INSERT INTO order_log(user_id,exchange,env,symbol,side,type,quantity,price,mode,ok,result) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [userId, 'binance', env, o.symbol, o.side, o.type, o.quantity ?? null, o.price ?? null, mode, ok, JSON.stringify(result ?? null)]);
}

// Limite simples de ordens reais por usuário (em memória): evita laço acidental ou clique repetido.
const hits = new Map<number, number[]>();
export function orderRateOk(userId: number, max = 10, windowMs = 60_000) {
  const now = Date.now(), arr = (hits.get(userId) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(userId, arr); return false; }
  arr.push(now); hits.set(userId, arr); return true;
}
