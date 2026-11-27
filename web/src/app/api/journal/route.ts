import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { getCandles } from '@/lib/candles';
import { INDICATOR_IDS } from '@/lib/indicators';
import { marketOf, validSymbol } from '@/lib/markets';
import { envOf } from '@/lib/binance';
import { TIMEFRAMES } from '@/lib/types';
import { closedCount } from '@/lib/journal';
import { listEntries, refreshJournal } from '@/lib/journal-store';

export const dynamic = 'force-dynamic';

const MAX_ENTRIES = 500;
const wrap = (fn: (req: Request, uid: number) => Promise<Response>) => async (req: Request) => {
  try { const uid = await requireUser(); await ensureSchema(); return await fn(req, uid); } catch (e) { if (e instanceof Response) return e; throw e; }
};
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
const pos = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;
const now = () => Math.floor(Date.now() / 1000);

export const GET = wrap(async (_req, uid) => {
  await refreshJournal(uid).catch((e) => console.error('diário', e));
  return NextResponse.json(await listEntries(uid));
});

export const POST = wrap(async (req, uid) => {
  const b = await req.json().catch(() => ({}));
  const market = marketOf(b.market), symbol = String(b.symbol ?? '').toUpperCase();
  if (!market || !validSymbol(market, symbol)) return bad('papel inválido');
  const stopGain = b.stopGain == null ? null : b.stopGain;
  if (stopGain != null && !pos(stopGain)) return bad('stop gain inválido');
  const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 500) : null;
  const count = (await pool.query('SELECT count(*)::int AS n FROM journal WHERE user_id=$1', [uid])).rows[0].n;
  if (count >= MAX_ENTRIES) return bad(`O diário chegou a ${MAX_ENTRIES} registros: exclua alguns.`);

  if (b.kind === 'real') {
    if (!pos(b.qty) || !pos(b.entryPrice)) return bad('informe quantidade e preço de entrada');
    if (b.stopLoss != null && !pos(b.stopLoss)) return bad('stop loss inválido');
    await pool.query(
      `INSERT INTO journal(user_id,kind,market,symbol,status,qty,entry_price,entry_time,stop_loss,stop_gain,note) VALUES ($1,'real',$2,$3,'open',$4,$5,$6,$7,$8,$9)`,
      [uid, market, symbol, b.qty, b.entryPrice, pos(b.entryTime) ? b.entryTime : now(), b.stopLoss ?? null, stopGain, note]);
    return NextResponse.json({ ok: true });
  }

  if (b.kind !== 'test' || !INDICATOR_IDS.includes(b.indicator) || !TIMEFRAMES.includes(b.timeframe) || !['signal', 'bars'].includes(b.exitRule)) return bad('cenário inválido');
  if (![b.capital, b.riskPct, b.stopLoss, b.step].every(pos) || b.riskPct > 100) return bad('informe capital, risco e stop loss');
  if (stopGain != null && stopGain <= b.stopLoss) return bad('o stop gain precisa ficar acima do stop loss');
  const env = market === 'binance' ? envOf(b.env) : 'production'; // acompanha no mesmo ambiente do gráfico
  let candles;
  try { candles = (await getCandles(symbol, b.timeframe, market, env)).candles; } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 502 }); }
  const ref = candles[closedCount(candles, b.timeframe, market) - 1];
  if (!ref) return bad('sem candles para este papel');
  await pool.query(
    `INSERT INTO journal(user_id,kind,market,symbol,timeframe,indicator,exit_rule,stop_loss,stop_gain,capital,risk_pct,step,ref_time,last_price,note,env,status)
     VALUES ($1,'test',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'waiting')`,
    [uid, market, symbol, b.timeframe, b.indicator, b.exitRule, b.stopLoss, stopGain, b.capital, b.riskPct, b.step, ref.time, candles.at(-1)!.close, note, env]);
  return NextResponse.json({ ok: true });
});

/** Encerra uma operação real com o preço em que ela foi de fato vendida. */
export const PATCH = wrap(async (req, uid) => {
  const b = await req.json().catch(() => ({}));
  if (!Number.isInteger(b.id) || !pos(b.exitPrice)) return bad('informe o preço de saída');
  const r = await pool.query(
    `UPDATE journal SET status='closed', exit_price=$3, exit_time=$4, reason='encerrada por você' WHERE id=$1 AND user_id=$2 AND kind='real' AND status='open'`,
    [b.id, uid, b.exitPrice, pos(b.exitTime) ? b.exitTime : now()]);
  return r.rowCount ? NextResponse.json({ ok: true }) : bad('registro não encontrado');
});

export const DELETE = wrap(async (req, uid) => {
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isInteger(id)) return bad('registro inválido');
  await pool.query('DELETE FROM journal WHERE id=$1 AND user_id=$2', [id, uid]);
  return NextResponse.json({ ok: true });
});
