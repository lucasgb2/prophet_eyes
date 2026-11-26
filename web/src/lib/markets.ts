import type { Timeframe } from './types';

/**
 * Registro de mercados. Para acrescentar um novo: inclua o id aqui, os dados em lib/<mercado>.ts
 * e o ramo correspondente em lib/candles.ts (candles), app/api/quote e app/api/assets.
 */
export const MARKET_IDS = ['b3', 'binance'] as const;
export type MarketId = (typeof MARKET_IDS)[number];

export type MarketDef = {
  id: MarketId; label: string; defaultSymbol: string; symbolRe: RegExp; placeholder: string;
  /** Mercado 24/7 (sem calendário de pregão). */
  alwaysOpen: boolean;
  /** Dá para enviar ordens pela API do Prophet. */
  canTrade: boolean;
  /** Intervalo de atualização do preço ao vivo, em ms. */
  quoteEveryMs: number;
};

export const MARKETS: Record<MarketId, MarketDef> = {
  b3: { id: 'b3', label: 'B3 (ações)', defaultSymbol: 'PETR4', symbolRe: /^[A-Z0-9]{4,8}$/, placeholder: 'Código ou empresa', alwaysOpen: false, canTrade: false, quoteEveryMs: 15000 },
  binance: { id: 'binance', label: 'Binance (cripto)', defaultSymbol: 'BTCUSDT', symbolRe: /^[A-Z0-9]{5,20}$/, placeholder: 'Par, ex.: BTCUSDT', alwaysOpen: true, canTrade: true, quoteEveryMs: 5000 },
};

export const isMarket = (x: unknown): x is MarketId => typeof x === 'string' && (MARKET_IDS as readonly string[]).includes(x);
export const validSymbol = (m: MarketId, s: unknown): s is string => typeof s === 'string' && MARKETS[m].symbolRe.test(s);
/** Mercado vindo de parâmetro/corpo de requisição; ausente = B3 (compatível com versões antigas). */
export const marketOf = (x: unknown): MarketId | null => (x == null || x === '' ? 'b3' : isMarket(x) ? x : null);

/** Chave do símbolo nas tabelas de cache: B3 mantém o código puro; os demais ganham prefixo (BINANCE:BTCUSDT). */
export const cacheSymbol = (m: MarketId, symbol: string, testnet = false) => (m === 'b3' ? symbol : `${m.toUpperCase()}${testnet ? '-TEST' : ''}:${symbol}`);

const QUOTES = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'TUSD', 'BTC', 'ETH', 'BNB', 'BRL', 'EUR', 'TRY'];
/** Separa um par da Binance em moeda base e de cotação (ex.: BTCUSDT -> BTC, USDT). */
export function splitPair(symbol: string): { base: string; quote: string } {
  const q = QUOTES.filter((x) => symbol.endsWith(x) && symbol.length > x.length).sort((a, b) => b.length - a.length)[0];
  return q ? { base: symbol.slice(0, -q.length), quote: q } : { base: symbol, quote: '' };
}
export const STABLE_QUOTES = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'TUSD'];

export function pricePrecision(m: MarketId, price: number): number {
  if (m === 'b3') return 2;
  return price >= 100 ? 2 : price >= 1 ? 4 : price >= 0.01 ? 6 : 8;
}

export function fmtPrice(m: MarketId, symbol: string, n: number): string {
  if (m === 'b3') return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const d = pricePrecision(m, n);
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: d })} ${splitPair(symbol).quote}`.trim();
}

export type { Timeframe };
