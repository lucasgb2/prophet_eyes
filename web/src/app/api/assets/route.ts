import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { pool } from '@/lib/db';
import { ensureSchema } from '@/lib/schema';
import { searchAssets } from '@/lib/brapi';
import { envOf, searchSymbols } from '@/lib/binance';
import { marketOf } from '@/lib/markets';

const query = async (q: string) => (await pool.query(
  `SELECT symbol, name FROM assets
    WHERE $1 = '' OR symbol ILIKE $2 OR name ILIKE $3
    ORDER BY (symbol ILIKE $2) DESC, (symbol LIKE '^%') DESC, symbol LIMIT 12`, // índices antes dos ETFs que só citam o nome
  [q, `${q}%`, `%${q}%`])).rows;

// Autocomplete: busca no banco; se houver poucos resultados, consulta a brapi e guarda o que aprender.
export async function GET(req: Request) {
  await ensureSchema();
  const sp = new URL(req.url).searchParams;
  const market = marketOf(sp.get('market'));
  if (!market) return NextResponse.json({ error: 'mercado inválido' }, { status: 400 });
  const q = (sp.get('q') ?? '').trim().slice(0, 30).replace(/[\\%_]/g, '');
  if (market === 'binance') {
    try { return NextResponse.json(await searchSymbols(q, envOf(sp.get('env')))); } catch { return NextResponse.json([]); }
  }
  let rows = await query(q);
  if (q.length >= 2 && rows.length < 5) {
    try {
      const found = await searchAssets(q);
      if (found.length) {
        await pool.query('INSERT INTO assets(symbol,name) SELECT * FROM unnest($1::text[],$2::text[]) ON CONFLICT DO NOTHING',
          [found.map((a) => a.symbol), found.map((a) => a.name)]);
        rows = await query(q);
      }
    } catch { /* brapi indisponível: segue com o que há no banco */ }
  }
  return NextResponse.json(rows);
}
