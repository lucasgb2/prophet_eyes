export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
export const TIMEFRAMES = ['1m', '5m', '15m', '30m', '60m', '1d', '1wk', '1mo'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];
