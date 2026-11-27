import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { validSymbol } from '@/lib/markets';
import { historyYears } from '@/lib/cotahist-import';
import type { HistoryStatus } from '@/lib/history-status';

export const dynamic = 'force-dynamic';

/** Situação do histórico longo de um papel da B3 (quem importa é o worker). */
export async function GET(req: Request) {
  try { await requireUser(); } catch (e) { if (e instanceof Response) return e; throw e; }
  const symbol = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!validSymbol('b3', symbol)) return NextResponse.json({ error: 'parâmetros inválidos' }, { status: 400 });
  if (!historyYears() || symbol.startsWith('^')) return NextResponse.json({ state: 'off' } satisfies HistoryStatus);
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT t.state, t.detail, extract(epoch from now()-t.updated_at)::float8 AS age, h.years, h.candles, extract(epoch from h.imported_at)::float8 AS imported,
            extract(epoch from (SELECT min(ts) FROM candles WHERE symbol=s.symbol AND timeframe='1d'))::float8 AS since
       FROM (SELECT $1::text AS symbol) s
       LEFT JOIN history_status t ON t.symbol=s.symbol LEFT JOIN history_import h ON h.symbol=s.symbol`, [symbol]);
  return NextResponse.json(historyStatus(rows[0], historyYears()));
}

function historyStatus(r: any, years: number): HistoryStatus {
  // download parado há muito tempo = worker reiniciado no meio; volta para a fila
  if ((r.state === 'locating' || r.state === 'downloading') && r.age < 15 * 60) return { state: r.state, detail: r.detail ?? undefined };
  if (r.years != null && r.years >= years) return r.candles ? { state: 'done', since: r.since, imported: r.imported } : { state: 'empty' };
  return { state: r.state === 'error' ? 'error' : 'pending' };
}
