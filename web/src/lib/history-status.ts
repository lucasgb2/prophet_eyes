export type HistoryStatus = {
  state: 'off' | 'pending' | 'locating' | 'downloading' | 'done' | 'empty' | 'error';
  detail?: string; // ano e porcentagem do download
  imported?: number; // quando foi a última importação: se mudar, o gráfico aberto está desatualizado
  since?: number; // primeiro candle diário (epoch em segundos)
};
