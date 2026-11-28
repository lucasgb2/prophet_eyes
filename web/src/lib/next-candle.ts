import type { Timeframe } from './types';

export const PERIOD_S: Record<Timeframe, number> = {
  '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '60m': 3600, '1d': 86400, '1wk': 7 * 86400, '1mo': 30 * 86400,
};

/** Quanto esperar (ms) até o candle atual fechar e valer a pena procurar o próximo. Limitado a 1 h (setTimeout não aguenta um mês). */
export const waitForClose = (lastTime: number, tf: Timeframe, nowS = Date.now() / 1000) =>
  Math.min(Math.max(0, lastTime + PERIOD_S[tf] - nowS) * 1000 + 3000, 3600_000);

/** Se o candle esperado não apareceu (mercado fechado, dado atrasado), de quanto em quanto tempo tentar de novo. */
export const retryMs = (tf: Timeframe) => Math.min(Math.max(PERIOD_S[tf] * 100, 30_000), 300_000);
