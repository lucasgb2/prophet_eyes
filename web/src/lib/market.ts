import type { Timeframe } from './types';

/**
 * Calendário simplificado do pregão da B3 (horário de Brasília, UTC-3, sem horário de verão).
 * Serve só para decidir QUANDO vale a pena pedir dados novos à brapi; errar um feriado custa uma busca a mais.
 * Feriados extras (ex.: pregão cancelado) podem ser somados por MARKET_HOLIDAYS="2027-02-10,2027-03-01".
 */
const BRT = -3 * 3600;
const OPEN_MIN = 9 * 60 + 50;   // 09:50 (folga antes do leilão de abertura das 10:00)
const CLOSE_MIN = 18 * 60 + 50; // 18:50 (folga após fechamento e after-market)

const HOLIDAYS = new Set([
  // 2026
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-04-03', '2026-04-21', '2026-05-01', '2026-06-04',
  '2026-09-07', '2026-10-12', '2026-11-02', '2026-11-20', '2026-12-24', '2026-12-25', '2026-12-31',
  // 2027
  '2027-01-01', '2027-02-08', '2027-02-09', '2027-03-26', '2027-04-21', '2027-05-27', '2027-09-07',
  '2027-10-12', '2027-11-02', '2027-11-15', '2027-12-24', '2027-12-31',
  ...(process.env.MARKET_HOLIDAYS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
]);

const parts = (epochSec: number) => {
  const d = new Date((epochSec + BRT) * 1000); // "relógio de Brasília" lido em campos UTC
  return { key: d.toISOString().slice(0, 10), dow: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
};

export function isTradingDay(epochSec: number): boolean {
  const p = parts(epochSec);
  return p.dow >= 1 && p.dow <= 5 && !HOLIDAYS.has(p.key);
}

export function marketOpen(epochSec: number): boolean {
  const p = parts(epochSec);
  return isTradingDay(epochSec) && p.min >= OPEN_MIN && p.min < CLOSE_MIN;
}

/** Instante (epoch s) do fim do pregão mais recente que já passou. */
export function lastSessionEnd(epochSec: number): number {
  const dayStart = Math.floor((epochSec + BRT) / 86400) * 86400 - BRT; // 00:00 de Brasília de hoje, em epoch
  for (let back = 0; back < 15; back++) {
    const t = dayStart - back * 86400 + CLOSE_MIN * 60;
    if (t <= epochSec && isTradingDay(t)) return t;
  }
  return epochSec; // não deve acontecer; na dúvida, trata como "acabou de fechar"
}

/** Quanto tempo um cache sincronizado vale, com o mercado aberto. */
export const FRESH_SEC: Record<Timeframe, number> = { '1m': 30, '5m': 60, '15m': 60, '30m': 60, '60m': 60, '1d': 300, '1wk': 300, '1mo': 300 };

/**
 * Precisa buscar na brapi? Com o mercado aberto, vale o prazo do timeframe.
 * Fechado, só se a última sincronização foi ANTES do fim do último pregão (falta pegar o fechamento).
 */
export function needsRefresh(tf: Timeframe, syncedAtSec: number | null, nowSec = Date.now() / 1000): boolean {
  if (syncedAtSec == null) return true;
  if (marketOpen(nowSec)) return nowSec - syncedAtSec > FRESH_SEC[tf];
  return syncedAtSec < lastSessionEnd(nowSec);
}
