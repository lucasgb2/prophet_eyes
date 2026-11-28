/** Séries históricas da B3 (COTAHIST): linhas de largura fixa, só o diário, preços nominais (sem ajuste). Funções puras. */
import type { Candle } from './types';

export type HistRow = Candle & { symbol: string; dismes: number };

const price = (s: string, factor: number) => Number(s) / 100 / factor;

/** Registro 01 do mercado à vista (TPMERC 010); outras linhas devolvem null. */
export function parseLine(l: string, wanted?: Set<string>): HistRow | null {
  if (l.length < 245 || !l.startsWith('01') || l.slice(24, 27) !== '010') return null;
  const symbol = l.slice(12, 24).trim();
  if (wanted && !wanted.has(symbol)) return null;
  const y = +l.slice(2, 6), m = +l.slice(6, 8), d = +l.slice(8, 10), factor = Number(l.slice(210, 217)) || 1;
  // mesmo carimbo dos candles diários da brapi: 00:00 de Brasília (03:00 UTC)
  const time = Date.UTC(y, m - 1, d, 3) / 1000;
  const row = {
    symbol, time, open: price(l.slice(56, 69), factor), high: price(l.slice(69, 82), factor), low: price(l.slice(82, 95), factor),
    close: price(l.slice(108, 121), factor), volume: Number(l.slice(152, 170)), dismes: Number(l.slice(242, 245)),
  };
  return Number.isFinite(time) && row.close > 0 && row.open > 0 ? row : null;
}

// proporções usuais de desdobramento, grupamento e bonificação grande (preço novo / preço antigo)
const RATIOS = [1 / 100, 1 / 50, 1 / 20, 1 / 10, 1 / 8, 1 / 5, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 2, 2, 3, 4, 5, 8, 10, 20, 50, 100];

export type Split = { time: number; ratio: number };

/** Salto de abertura grande demais para um pregão comum: candidato a desdobramento/grupamento. */
const bigJump = (jump: number) => jump <= 0.72 || jump >= 1.4;

/** Datas dos candles diários que abriram com salto grande sobre o fechamento anterior. */
export const bigJumps = (candles: Pick<Candle, 'time' | 'open' | 'close'>[]): number[] =>
  candles.filter((c, i) => i > 0 && candles[i - 1].close > 0 && bigJump(c.open / candles[i - 1].close)).map((c) => c.time);

/**
 * Ajusta o passado por desdobramentos e grupamentos: só quando a B3 muda o número de distribuição (houve um evento)
 * E o preço salta numa proporção típica. Dividendos e bonificações pequenas NÃO são ajustados.
 * `rows` em ordem de data, de um único papel.
 */
export function adjustSplits(rows: HistRow[]): { candles: Candle[]; splits: Split[] } {
  const splits: Split[] = [];
  const out: Candle[] = [];
  let factor = 1; // acumulado, aplicado de trás para frente
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    out.push({ time: r.time, open: r.open * factor, high: r.high * factor, low: r.low * factor, close: r.close * factor, volume: Math.round(r.volume / factor) });
    const prev = rows[i - 1];
    if (!prev || prev.dismes === r.dismes) continue;
    const jump = r.open / prev.close;
    if (!bigJump(jump)) continue;
    const ratio = RATIOS.reduce((a, b) => (Math.abs(Math.log(jump / b)) < Math.abs(Math.log(jump / a)) ? b : a));
    if (Math.abs(Math.log(jump / ratio)) > 0.12) continue;
    factor *= ratio;
    splits.push({ time: r.time, ratio });
  }
  return { candles: out.reverse(), splits: splits.reverse() };
}
