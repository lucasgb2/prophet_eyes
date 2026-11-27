import type { ComponentType, ReactNode } from 'react';
import TelegramPanel from './TelegramPanel';
import SimulationPanel from './SimulationPanel';
import type { Candle } from '@/lib/types';
import type { Trade } from '@/lib/backtest';
import type { MarketId } from '@/lib/markets';
import TradePanel from './TradePanel';
import NewsPanel from './NewsPanel';

/** Contexto repassado a cada ferramenta da barra lateral (a aba/ativo atual). */
export type ToolCtx = {
  market: MarketId; symbol: string; timeframe: string;
  candles: Candle[]; indicators: string[];
  /** A simulação publica as operações para o gráfico desenhar (null limpa). */
  onTrades?: (t: Trade[] | null) => void;
};

/** `markets`: em quais mercados a ferramenta aparece (ausente = todos). */
export type Tool = { id: string; title: string; icon: ReactNode; markets?: MarketId[]; Panel: ComponentType<{ ctx: ToolCtx }> };

const svg = (d: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

/**
 * Para adicionar uma ferramenta nova à barra lateral direita: crie o painel em components/tools/
 * e acrescente um item aqui (id único, título, ícone e Panel). A barra e o painel deslizante são genéricos.
 */
export const TOOLS: Tool[] = [
  {
    id: 'telegram',
    title: 'Notificações (Telegram)',
    icon: svg(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>),
    Panel: TelegramPanel,
  },
  {
    id: 'simulacao',
    title: 'Simulação de operações',
    icon: svg(<><path d="M3 3v18h18" /><path d="m7 15 4-5 3 3 5-7" /></>),
    Panel: SimulationPanel,
  },
  {
    id: 'noticias',
    title: 'Notícias',
    icon: svg(<><path d="M4 5h13v13a1 1 0 0 0 1 1H6a2 2 0 0 1-2-2Z" /><path d="M17 9h3v8a2 2 0 0 1-2 2M7 9h7M7 12h7M7 15h4" /></>),
    Panel: NewsPanel,
  },
  {
    id: 'operar',
    title: 'Operar (Binance)',
    markets: ['binance'],
    icon: svg(<><path d="M7 4v16M7 4 4 7M7 4l3 3" /><path d="M17 20V4m0 16-3-3m3 3 3-3" /></>),
    Panel: TradePanel,
  },
];
