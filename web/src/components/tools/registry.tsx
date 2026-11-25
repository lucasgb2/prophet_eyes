import type { ComponentType, ReactNode } from 'react';
import TelegramPanel from './TelegramPanel';
import SimulationPanel from './SimulationPanel';
import type { Candle } from '@/lib/types';
import type { Trade } from '@/lib/backtest';

/** Contexto repassado a cada ferramenta da barra lateral (a aba/ativo atual). */
export type ToolCtx = {
  symbol: string; timeframe: string;
  candles: Candle[]; indicators: string[];
  /** A simulação publica as operações para o gráfico desenhar (null limpa). */
  onTrades?: (t: Trade[] | null) => void;
};

export type Tool = { id: string; title: string; icon: ReactNode; Panel: ComponentType<{ ctx: ToolCtx }> };

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
];
