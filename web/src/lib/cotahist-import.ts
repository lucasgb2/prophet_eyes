/** Baixa os arquivos anuais da B3 e importa o diário dos papéis pedidos. Lê em fluxo: nada é gravado em disco. */
import { createInflateRaw } from 'node:zlib';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pool } from './db';
import { adjustSplits, bigJumps, parseLine, type HistRow } from './cotahist';

export const historyYears = () => { const n = Number(process.env.HISTORY_YEARS ?? 5); return Number.isInteger(n) && n >= 0 && n <= 20 ? n : 5; };
const BASE = () => process.env.COTAHIST_URL ?? 'https://bvmf.bmfbovespa.com.br/InstDados/SerHist';

/** O zip tem um único arquivo: pula o cabeçalho local e descompacta o resto conforme chega. */
async function* zipBody(stream: AsyncIterable<Uint8Array>) {
  let head = Buffer.alloc(0), skipped = false;
  for await (const chunk of stream) {
    if (skipped) { yield chunk; continue; }
    head = Buffer.concat([head, chunk]);
    if (head.length < 30) continue;
    if (head.readUInt32LE(0) !== 0x04034b50 || head.readUInt16LE(8) !== 8) throw new Error('zip da B3 em formato inesperado');
    const start = 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
    if (head.length < start) continue;
    skipped = true;
    yield head.subarray(start);
  }
}

/** Andamento que a tela mostra. Falha ao gravar não interrompe a importação. */
async function setStatus(symbols: string[], state: 'locating' | 'downloading' | 'done' | 'empty' | 'error', detail: string | null = null) {
  await pool.query(
    `INSERT INTO history_status(symbol,state,detail) SELECT s,$2,$3 FROM unnest($1::text[]) AS s
     ON CONFLICT (symbol) DO UPDATE SET state=EXCLUDED.state, detail=EXCLUDED.detail, updated_at=now()`,
    [symbols, state, detail]).catch((e) => console.error('status do histórico', e.message));
}

type Progress = (pct: number | null) => Promise<void>;

/** Repassa os bytes do download avisando o andamento de 5 em 5%. */
async function* counted(stream: AsyncIterable<Uint8Array>, total: number, progress: Progress) {
  let got = 0, last = -5;
  for await (const chunk of stream) {
    got += chunk.length;
    const pct = total > 0 ? Math.min(100, Math.floor((got / total) * 100)) : null;
    if (pct != null && pct >= last + 5) { last = pct; await progress(pct); }
    yield chunk;
  }
}

async function readYear(year: number, wanted: Set<string>, into: Map<string, HistRow[]>, progress: Progress) {
  const res = await fetch(`${BASE()}/COTAHIST_A${year}.ZIP`, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10 * 60_000), cache: 'no-store' });
  if (!res.ok || !res.body) throw new Error(`B3 respondeu ${res.status} para o histórico de ${year}`);
  await progress(null);
  const body = counted(res.body as unknown as AsyncIterable<Uint8Array>, Number(res.headers.get('content-length')), progress);
  const source = Readable.from(zipBody(body));
  const inflate = createInflateRaw();
  source.on('error', (e) => inflate.destroy(e));
  source.pipe(inflate);
  let lines = 0, trailer = false;
  for await (const line of createInterface({ input: inflate.setEncoding('latin1'), crlfDelay: Infinity })) {
    lines++;
    if (line.startsWith('99')) trailer = true;
    const r = parseLine(line, wanted);
    if (r) (into.get(r.symbol) ?? into.set(r.symbol, []).get(r.symbol)!).push(r);
  }
  if (!trailer) throw new Error(`histórico de ${year} veio incompleto (${lines} linhas)`);
}

const daily = async (symbol: string) => (await pool.query(
  `SELECT extract(epoch from ts)::float8 AS time, open, close FROM candles WHERE symbol=$1 AND timeframe='1d' ORDER BY ts`, [symbol])).rows;

/**
 * Importa os últimos `years` anos (mais o atual) para os símbolos. Os dias presentes no arquivo substituem os do banco,
 * para que a série inteira fique no mesmo ajuste de desdobramento; dias mais novos que o arquivo (brapi) ficam.
 */
export async function importHistory(symbols: string[], years = historyYears()): Promise<Record<string, number>> {
  try { return await run(symbols, years); }
  catch (e) { await setStatus(symbols, 'error'); throw e; }
}

async function run(symbols: string[], years: number) {
  const wanted = new Set(symbols), rows = new Map<string, HistRow[]>();
  const today = new Date(), now = today.getUTCFullYear();
  const window = Date.UTC(now - years, today.getUTCMonth(), today.getUTCDate()) / 1000;
  // reimportação: recomeça de onde o banco já começa, senão sobrariam dias antigos sem o ajuste novo
  const since = new Map<string, number>();
  for (const symbol of symbols) since.set(symbol, Math.min(window, (await daily(symbol))[0]?.time ?? window));
  const first = new Date(Math.min(...since.values()) * 1000).getUTCFullYear();

  await setStatus(symbols, 'locating');
  for (let y = first; y <= now; y++) {
    const step = `ano ${y} (${y - first + 1} de ${now - first + 1})`;
    await readYear(y, wanted, rows, (pct) => setStatus(symbols, 'downloading', pct == null ? step : `${step} · ${pct}%`));
  }

  const done: Record<string, number> = {};
  for (const symbol of symbols) {
    const list = (rows.get(symbol) ?? []).sort((a, b) => a.time - b.time);
    const { candles, splits } = adjustSplits(list);
    const keep = candles.filter((c) => c.time >= since.get(symbol)!);
    if (keep.length) {
      const col = (k: keyof (typeof keep)[number]) => keep.map((c) => c[k]);
      await pool.query(
        `INSERT INTO candles(symbol,timeframe,ts,open,high,low,close,volume)
         SELECT $1,'1d',to_timestamp(t),o,h,l,c,v FROM unnest($2::float8[],$3::float8[],$4::float8[],$5::float8[],$6::float8[],$7::float8[]) AS x(t,o,h,l,c,v)
         ON CONFLICT (symbol,timeframe,ts) DO UPDATE
           SET open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low, close=EXCLUDED.close, volume=EXCLUDED.volume`,
        [symbol, col('time'), col('open'), col('high'), col('low'), col('close'), col('volume')]);
    }
    // Saltos que restaram dentro do período do arquivo são do mercado mesmo. Depois dele, o arquivo ainda não
    // publicou o dia: tenta de novo mais tarde. Papel fora do arquivo: nada a conferir.
    const last = keep.at(-1)?.time ?? Infinity;
    const jumps = bigJumps(await daily(symbol));
    await pool.query(
      `INSERT INTO history_import(symbol,years,candles,splits,jumps,retry_at) VALUES ($1,$2,$3,$4,$5,CASE WHEN $6 THEN now()+interval '12 hours' END)
       ON CONFLICT (symbol) DO UPDATE SET years=EXCLUDED.years, candles=EXCLUDED.candles, splits=EXCLUDED.splits,
         jumps=EXCLUDED.jumps, retry_at=EXCLUDED.retry_at, imported_at=now()`,
      [symbol, years, keep.length, JSON.stringify(splits), JSON.stringify(jumps.filter((t) => t <= last)), jumps.some((t) => t > last)]);
    await setStatus([symbol], keep.length ? 'done' : 'empty');
    done[symbol] = keep.length;
  }
  return done;
}

/** Papéis da B3 em uso (abas, alertas, sinos) que ainda não têm o histórico longo. Índices (^) não estão no arquivo. */
export async function pendingSymbols(years = historyYears()): Promise<string[]> {
  const { rows } = await pool.query(`
    SELECT s.symbol FROM (SELECT symbol FROM profiles WHERE market='b3' UNION SELECT symbol FROM alerts WHERE market='b3' AND active
                          UNION SELECT symbol FROM news_bells WHERE market='b3') s
    LEFT JOIN history_import h ON h.symbol=s.symbol
    WHERE s.symbol NOT LIKE '^%' AND (h.symbol IS NULL OR h.years < $1)`, [years]);
  return rows.map((r) => r.symbol);
}

/** Papéis já importados que ganharam um salto novo no diário (desdobramento depois da importação): reimportar. */
export async function jumpedSymbols(): Promise<string[]> {
  const { rows } = await pool.query('SELECT symbol, jumps FROM history_import WHERE retry_at IS NULL OR retry_at <= now()');
  const out: string[] = [];
  for (const r of rows) if (bigJumps(await daily(r.symbol)).some((t) => !r.jumps.includes(t))) out.push(r.symbol);
  return out;
}
