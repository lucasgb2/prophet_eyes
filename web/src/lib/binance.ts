import { createHmac } from 'node:crypto';
import type { Candle, Timeframe } from './types';
import { STABLE_QUOTES, splitPair } from './markets';

// ---------- Dados públicos (sem chave) ----------
const DATA = () => process.env.BINANCE_DATA_URL ?? 'https://data-api.binance.vision';
const INTERVAL: Record<Timeframe, string> = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '60m': '1h', '1d': '1d', '1wk': '1w', '1mo': '1M' };
const PAGE = 1000;

export class BinanceError extends Error {
  constructor(public status: number, public code: number | null, msg: string) { super(msg); }
}

async function get(base: string, path: string, params: Record<string, string | number> = {}, init: RequestInit = {}) {
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new BinanceError(res.status, body?.code ?? null, `Binance ${res.status}${body?.msg ? `: ${body.msg}` : ''}`);
  return body;
}

export function parseKlines(rows: any[][]): Candle[] {
  return rows.map((r) => ({ time: Math.floor(r[0] / 1000), open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] }));
}

/**
 * Candles da Binance. Sem `fromSec`: os últimos `initialPages`·1000 candles. Com `fromSec`: do candle indicado até agora
 * (o candle em formação vem junto e é reescrito no cache a cada busca).
 */
export async function fetchKlines(symbol: string, tf: Timeframe, opts: { fromSec?: number | null; initialPages?: number } = {}): Promise<Candle[]> {
  const q = { symbol, interval: INTERVAL[tf], limit: PAGE };
  if (opts.fromSec == null) {
    let out = parseKlines(await get(DATA(), '/api/v3/klines', q));
    for (let p = 1; p < (opts.initialPages ?? 2) && out.length >= PAGE; p++) {
      const older = parseKlines(await get(DATA(), '/api/v3/klines', { ...q, endTime: out[0].time * 1000 - 1 }));
      if (!older.length) break;
      out = [...older, ...out];
      if (older.length < PAGE) break;
    }
    return out;
  }
  let out: Candle[] = [], start = opts.fromSec * 1000;
  for (let p = 0; p < 20; p++) {
    const page = parseKlines(await get(DATA(), '/api/v3/klines', { ...q, startTime: start }));
    out = out.concat(page);
    if (page.length < PAGE) break;
    start = page[page.length - 1].time * 1000 + 1;
  }
  return out;
}

export async function ticker24h(symbol: string) {
  const t = await get(DATA(), '/api/v3/ticker/24hr', { symbol });
  return { symbol, price: +t.lastPrice, previousClose: +t.prevClosePrice, changePct: +t.priceChangePercent, source: 'binance', fetchedAt: Math.floor(Date.now() / 1000) };
}

let symbolsCache: { at: number; list: string[] } | null = null;
async function allSymbols(): Promise<string[]> {
  if (symbolsCache && Date.now() - symbolsCache.at < 3600_000) return symbolsCache.list;
  const rows: { symbol: string }[] = await get(DATA(), '/api/v3/ticker/price');
  symbolsCache = { at: Date.now(), list: rows.map((r) => r.symbol) };
  return symbolsCache.list;
}

const POPULAR = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'BTCBRL', 'ETHBRL', 'USDTBRL'];
export async function searchSymbols(q: string): Promise<{ symbol: string; name: string }[]> {
  const all = await allSymbols();
  const name = (s: string) => { const p = splitPair(s); return p.quote ? `${p.base} / ${p.quote}` : s; };
  const up = q.toUpperCase();
  const pick = !up ? POPULAR.filter((s) => all.includes(s))
    : all.filter((s) => s.includes(up)).sort((a, b) =>
        Number(b.startsWith(up)) - Number(a.startsWith(up)) ||
        Number(b.endsWith('USDT')) - Number(a.endsWith('USDT')) ||
        Number(STABLE_QUOTES.some((x) => b.endsWith(x))) - Number(STABLE_QUOTES.some((x) => a.endsWith(x))) || a.length - b.length || a.localeCompare(b)).slice(0, 12);
  return pick.map((s) => ({ symbol: s, name: name(s) }));
}

// ---------- Regras do par (filtros de quantidade, preço e valor mínimo) ----------
export type Rules = { symbol: string; status: string; base: string; quote: string; stepSize: string; minQty: string; maxQty: string; tickSize: string; minPrice: string; minNotional: string };
const rulesCache = new Map<string, { at: number; r: Rules }>();
export async function symbolRules(symbol: string): Promise<Rules> {
  const hit = rulesCache.get(symbol);
  if (hit && Date.now() - hit.at < 3600_000) return hit.r;
  const info = await get(DATA(), '/api/v3/exchangeInfo', { symbol });
  const s = info.symbols?.[0];
  if (!s) throw new BinanceError(400, -1121, 'Par inexistente na Binance');
  const f = (t: string) => s.filters.find((x: any) => x.filterType === t) ?? {};
  const r: Rules = {
    symbol, status: s.status, base: s.baseAsset, quote: s.quoteAsset,
    stepSize: f('LOT_SIZE').stepSize ?? '0.00000001', minQty: f('LOT_SIZE').minQty ?? '0', maxQty: f('LOT_SIZE').maxQty ?? '9000000000',
    tickSize: f('PRICE_FILTER').tickSize ?? '0.00000001', minPrice: f('PRICE_FILTER').minPrice ?? '0',
    minNotional: (f('NOTIONAL').minNotional ?? f('MIN_NOTIONAL').minNotional ?? '0'),
  };
  rulesCache.set(symbol, { at: Date.now(), r });
  return r;
}

// ---------- Aritmética decimal exata para quantidade/preço ----------
const DEC = /^\d+(\.\d+)?$/;
const decimals = (s: string) => (s.split('.')[1] ?? '').replace(/0+$/, '').length;
const scale = (s: string, d: number) => { const [i, f = ''] = s.split('.'); return BigInt(i + f.replace(/0+$/, '').padEnd(d, '0')); };

/** Arredonda `value` para baixo para um múltiplo de `step` (strings decimais, sem erro de ponto flutuante). */
export function floorToStep(value: string, step: string): string {
  if (!DEC.test(value) || !DEC.test(step)) throw new Error('número inválido');
  const ds = decimals(step), d = Math.max(decimals(value), ds, 1);
  const s = scale(step, d); if (s === 0n) return value;
  const a = scale(value, d), fl = a - (a % s);
  const str = fl.toString().padStart(d + 1, '0');
  const out = `${str.slice(0, str.length - d)}.${str.slice(str.length - d)}`;
  const [i, f] = out.split('.');
  return ds === 0 ? i : `${i}.${f.slice(0, ds).padEnd(ds, '0')}`;
}
const cmp = (a: string, b: string) => { const d = Math.max(decimals(a), decimals(b)); const x = scale(a, d), y = scale(b, d); return x < y ? -1 : x > y ? 1 : 0; };

export type OrderInput = { side: 'BUY' | 'SELL'; type: 'MARKET' | 'LIMIT'; quantity: string; price?: string };
export type PreparedOrder = { symbol: string; side: 'BUY' | 'SELL'; type: 'MARKET' | 'LIMIT'; quantity: string; price?: string; notional: number };

/** Aplica os filtros do par à ordem (arredonda para os passos, confere mínimos). Lança Error com mensagem em português. */
export function prepareOrder(rules: Rules, o: OrderInput, lastPrice: number): PreparedOrder {
  if (rules.status !== 'TRADING') throw new Error(`Par não está negociável agora (status ${rules.status})`);
  if (o.side !== 'BUY' && o.side !== 'SELL') throw new Error('Lado inválido');
  if (o.type !== 'MARKET' && o.type !== 'LIMIT') throw new Error('Tipo de ordem inválido');
  const q = String(o.quantity ?? '').trim().replace(',', '.');
  if (!DEC.test(q) || Number(q) <= 0) throw new Error('Quantidade inválida');
  const qty = floorToStep(q, rules.stepSize);
  if (cmp(qty, rules.minQty) < 0) throw new Error(`Quantidade abaixo do mínimo (${rules.minQty}, passo ${rules.stepSize})`);
  if (cmp(qty, rules.maxQty) > 0) throw new Error(`Quantidade acima do máximo (${rules.maxQty})`);
  let price: string | undefined;
  if (o.type === 'LIMIT') {
    const p = String(o.price ?? '').trim().replace(',', '.');
    if (!DEC.test(p) || Number(p) <= 0) throw new Error('Preço inválido para ordem limite');
    price = floorToStep(p, rules.tickSize);
    if (cmp(price, rules.minPrice) < 0) throw new Error(`Preço abaixo do mínimo (${rules.minPrice}, passo ${rules.tickSize})`);
  }
  const ref = price ? Number(price) : lastPrice;
  const notional = Number(qty) * ref;
  if (Number(rules.minNotional) > 0 && notional < Number(rules.minNotional)) throw new Error(`Valor da ordem (${notional.toFixed(2)} ${rules.quote}) abaixo do mínimo (${rules.minNotional} ${rules.quote})`);
  return { symbol: rules.symbol, side: o.side, type: o.type, quantity: qty, price, notional };
}

// ---------- Operações autenticadas (homologação ou produção) ----------
export type Env = 'testnet' | 'production';
export const isEnv = (x: unknown): x is Env => x === 'testnet' || x === 'production';
export type Creds = { apiKey: string; apiSecret: string };
const TRADE_URL: Record<Env, () => string> = {
  testnet: () => process.env.BINANCE_TESTNET_URL ?? 'https://testnet.binance.vision',
  production: () => process.env.BINANCE_URL ?? 'https://api.binance.com',
};

export const sign = (secret: string, query: string) => createHmac('sha256', secret).update(query).digest('hex');

async function signed(env: Env, c: Creds, method: 'GET' | 'POST' | 'DELETE', path: string, params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), recvWindow: '10000', timestamp: String(Date.now()) }).toString();
  const url = `${TRADE_URL[env]()}${path}?${qs}&signature=${sign(c.apiSecret, qs)}`;
  const res = await fetch(url, { method, headers: { 'X-MBX-APIKEY': c.apiKey }, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new BinanceError(res.status, body?.code ?? null, `Binance ${res.status}${body?.code ? ` (${body.code})` : ''}${body?.msg ? `: ${body.msg}` : ''}`);
  return body;
}

export async function getBalances(env: Env, c: Creds) {
  const a = await signed(env, c, 'GET', '/api/v3/account');
  return {
    canTrade: !!a.canTrade,
    balances: (a.balances as any[]).map((b) => ({ asset: b.asset as string, free: b.free as string, locked: b.locked as string }))
      .filter((b) => Number(b.free) > 0 || Number(b.locked) > 0),
  };
}

export async function sendOrder(env: Env, c: Creds, o: PreparedOrder, testOnly: boolean) {
  const params: Record<string, string> = { symbol: o.symbol, side: o.side, type: o.type, quantity: o.quantity, newOrderRespType: 'RESULT' };
  if (o.type === 'LIMIT') { params.price = o.price!; params.timeInForce = 'GTC'; }
  const r = await signed(env, c, 'POST', testOnly ? '/api/v3/order/test' : '/api/v3/order', params);
  return testOnly ? { test: true } : { orderId: r.orderId, status: r.status, executedQty: r.executedQty, cummulativeQuoteQty: r.cummulativeQuoteQty, price: r.price };
}

const slim = (o: any) => ({ orderId: o.orderId, symbol: o.symbol, side: o.side, type: o.type, status: o.status, price: o.price, origQty: o.origQty, executedQty: o.executedQty, time: Math.floor((o.time ?? o.transactTime ?? 0) / 1000) });
export const openOrders = async (env: Env, c: Creds, symbol: string) => (await signed(env, c, 'GET', '/api/v3/openOrders', { symbol })).map(slim);
export const recentOrders = async (env: Env, c: Creds, symbol: string) => (await signed(env, c, 'GET', '/api/v3/allOrders', { symbol, limit: 15 })).map(slim).reverse();
export const cancelOrder = (env: Env, c: Creds, symbol: string, orderId: number) => signed(env, c, 'DELETE', '/api/v3/order', { symbol, orderId });
