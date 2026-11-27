/** Busca notícias nas fontes e guarda no banco (sem repetir). Usado pelo worker e pela API quando o dado está velho. */
import { pool } from '../db';
import { ensureSchema } from '../schema';
import { splitPair, type MarketId } from '../markets';
import { SEED_ASSETS } from '../seed-assets';
import { classify, parseFeed, type FeedItem } from './parse';
import { cvmItems } from './cvm';

export const NEWS_EVERY_MS = 15 * 60_000;
type Item = FeedItem & { kind: 'noticia' | 'fato' | 'oficial'; dateOnly?: boolean };

async function feed(url: string, source: string | null, kind: Item['kind'] = 'noticia'): Promise<Item[]> {
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (news reader)' }, signal: AbortSignal.timeout(15_000), cache: 'no-store' });
  if (!r.ok) throw new Error(`${new URL(url).hostname} respondeu ${r.status}`);
  const xml = await r.text();
  if (xml.length > 5_000_000) throw new Error(`${new URL(url).hostname}: resposta grande demais`);
  return parseFeed(xml).slice(0, 60).map((i) => ({ ...i, source: source ?? i.source, kind }));
}

// O Google Notícias limita rajadas (HTTP 429): uma consulta por vez, com 2 s entre elas
let googleQueue: Promise<unknown> = Promise.resolve();
const google = (q: string): Promise<Item[]> => {
  const p = googleQueue.then(() => googleNow(q));
  googleQueue = p.catch(() => {}).then(() => new Promise((r) => setTimeout(r, 2000)));
  return p;
};
const googleNow = (q: string) => feed(`${process.env.GOOGLE_NEWS_URL ?? 'https://news.google.com'}/rss/search?q=${encodeURIComponent(`${q} when:7d`)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`, null);

const COINS: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', BNB: 'BNB Binance Coin', SOL: 'Solana', XRP: 'XRP Ripple', ADA: 'Cardano', DOGE: 'Dogecoin',
  AVAX: 'Avalanche', DOT: 'Polkadot', LINK: 'Chainlink', LTC: 'Litecoin', MATIC: 'Polygon', TRX: 'Tron', SHIB: 'Shiba Inu', USDT: 'Tether',
};

async function companyName(symbol: string): Promise<string | null> {
  const name = SEED_ASSETS.find(([s]) => s === symbol)?.[1]
    ?? (await pool.query('SELECT name FROM assets WHERE symbol=$1', [symbol])).rows[0]?.name;
  return name ? String(name).replace(/\(.*?\)/g, '').replace(/\s+(ON|PN[AB]?|UNIT|ETF)\b.*$/i, '').trim() : null;
}

/** Fontes de cada feed. Símbolo vazio = notícias gerais do mercado. */
async function sources(market: MarketId, symbol: string): Promise<Promise<Item[]>[]> {
  if (market === 'binance') {
    if (!symbol) return [google('criptomoedas OR bitcoin'), feed('https://www.coindesk.com/arc/outboundfeeds/rss/', 'CoinDesk')];
    const base = splitPair(symbol).base || symbol;
    return [google(`"${COINS[base] ?? base}" criptomoeda`)];
  }
  if (!symbol) return [
    google('Ibovespa OR Copom OR Selic OR IPCA OR "dólar hoje"'),
    // o feed do portal traz de tudo; ficam só mercado e economia
    feed('https://www.infomoney.com.br/feed/', 'InfoMoney').then((l) => l.filter((i) => i.tags?.some((t) => /^(Mercados|Economia|Ações|Bolsa|Câmbio)$/i.test(t)))),
    feed('https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/notasImprensa', 'Banco Central', 'oficial'),
    feed('https://agenciadenoticias.ibge.gov.br/agencia-rss', 'IBGE', 'oficial'),
  ];
  const name = await companyName(symbol);
  return [
    google(symbol === '^BVSP' ? 'Ibovespa' : name ? `${symbol} OR "${name}" ações` : `${symbol} ações`),
    cvmItems(symbol).then((l) => l.map((i) => ({ ...i, kind: 'fato' as const, dateOnly: true }))),
  ];
}

const running = new Map<string, Promise<string[]>>();

/** Atualiza o feed se a última busca tem mais de 15 min. Devolve os erros das fontes que falharam (as outras são gravadas). */
export function syncNews(market: MarketId, symbol: string): Promise<string[]> {
  const key = `${market}|${symbol}`;
  let p = running.get(key);
  if (!p) { p = doSync(market, symbol).finally(() => running.delete(key)); running.set(key, p); }
  return p;
}

async function doSync(market: MarketId, symbol: string): Promise<string[]> {
  await ensureSchema();
  const last = (await pool.query('SELECT synced_at FROM news_sync WHERE market=$1 AND symbol=$2', [market, symbol])).rows[0]?.synced_at;
  if (last && Date.now() - new Date(last).getTime() < NEWS_EVERY_MS) return [];
  const results = await Promise.allSettled(await sources(market, symbol));
  const errors = results.flatMap((r) => (r.status === 'rejected' ? [String(r.reason?.message ?? r.reason)] : []));
  const items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  for (const i of items) {
    await pool.query(
      `INSERT INTO news(market,symbol,url,title,source,kind,category,published_at,date_only,source_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,to_timestamp($8),$9,$10)
       ON CONFLICT (market,symbol,url) DO UPDATE SET source_url=EXCLUDED.source_url WHERE news.source_url IS NULL AND EXCLUDED.source_url IS NOT NULL`,
      [market, symbol, i.url, i.title, i.source, i.kind, classify(i.title), i.publishedAt, !!i.dateOnly, i.sourceUrl ?? null]);
  }
  // se tudo falhou, não marca como sincronizado: tenta de novo na próxima vez
  if (results.some((r) => r.status === 'fulfilled'))
    await pool.query('INSERT INTO news_sync(market,symbol) VALUES ($1,$2) ON CONFLICT (market,symbol) DO UPDATE SET synced_at=now()', [market, symbol]);
  return errors;
}
