import type { ComponentType, ReactNode } from 'react';
import TelegramPanel from './TelegramPanel';
import SimulationPanel from './SimulationPanel';
import type { Candle, Timeframe } from '@/lib/types';
import type { Trade } from '@/lib/backtest';
import type { MarketId } from '@/lib/markets';
import TradePanel from './TradePanel';
import NewsPanel from './NewsPanel';
import RiskPanel from './RiskPanel';
import JournalPanel from './JournalPanel';
import RobotPanel from './RobotPanel';
import ValidatePanel from './ValidatePanel';
import type { IndicatorId } from '@/lib/indicators';

/** Contexto repassado a cada ferramenta da barra lateral (a aba/ativo atual). */
export type ToolCtx = {
  market: MarketId; symbol: string; timeframe: string;
  /** Timeframes que o papel permite (o plano da brapi limita alguns). */
  timeframes?: Timeframe[];
  /** Ambiente dos dados na Binance. */
  env?: string;
  candles: Candle[]; indicators: string[];
  /** A simulação publica as operações para o gráfico desenhar (null limpa). */
  onTrades?: (t: Trade[] | null) => void;
  /** Preenchimento vindo de um cartão de indicador (“Acompanhar”). */
  preset?: { symbol: string; indicator: IndicatorId; entry: number | null } | null;
};

/** `markets`: em quais mercados a ferramenta aparece (ausente = todos). */
export type Tool = { id: string; title: string; icon: ReactNode; markets?: MarketId[]; /** Abre numa janela larga em vez do painel lateral. */ modal?: boolean; Panel: ComponentType<{ ctx: ToolCtx }> };

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
    id: 'risco',
    title: 'Calculadora de risco',
    icon: svg(<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" /></>),
    Panel: RiskPanel,
  },
  {
    id: 'diario',
    title: 'Diário de operações',
    icon: svg(<><path d="M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6Z" /><path d="M6 3v18M10 8h5M10 12h5M4 7h2M4 12h2M4 17h2" /></>),
    Panel: JournalPanel,
  },
  {
    id: 'robo',
    title: 'Robô de teste',
    modal: true,
    icon: svg(<><rect x="4" y="8" width="16" height="11" rx="2" /><path d="M12 4v4M9 13h.01M15 13h.01M9 16h6M2 13h2M20 13h2" /></>),
    Panel: RobotPanel,
  },
  {
    id: 'validacao',
    title: 'Teste fora da amostra',
    modal: true,
    icon: svg(<><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" /><path d="M7.5 15h9" /></>),
    Panel: ValidatePanel,
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
