import type { IndicatorId } from './indicators';

export type IndicatorHelp = {
  what: string;   // o que é, em uma frase simples
  read: string;   // como ler no gráfico
  signal: string; // quando este app marca compra/venda
  care: string;   // cuidado / limitação
};

const MA_CARE = 'Em mercado lateral (sem direção) a linha é cruzada várias vezes e gera sinais falsos. É um indicador que “chega atrasado”: confirma o movimento depois que ele já começou.';
const ma = (n: number, kind: string, speed: string): IndicatorHelp => ({
  what: `É a ${kind} do preço de fechamento dos últimos ${n} candles. Ela “alisa” as oscilações e mostra para onde o preço vem caminhando. ${speed}`,
  read: 'Preço acima da linha indica tendência de alta; abaixo, tendência de baixa. Quanto mais inclinada a linha, mais forte a tendência.',
  signal: 'Compra quando o preço cruza a linha de baixo para cima; venda quando cruza de cima para baixo.',
  care: MA_CARE,
});

export const INDICATOR_HELP: Record<IndicatorId, IndicatorHelp> = {
  ema9: ma(9, 'média exponencial (dá mais peso aos candles recentes)', 'É rápida: reage logo, mas erra mais.'),
  ema21: ma(21, 'média exponencial (dá mais peso aos candles recentes)', 'Velocidade intermediária, comum em swing trade.'),
  sma20: ma(20, 'média simples', 'Muito usada para ver a tendência de curto prazo.'),
  sma50: ma(50, 'média simples', 'Mostra a tendência de médio prazo.'),
  sma200: ma(200, 'média simples', 'É a referência de longo prazo: muita gente a usa para separar mercado de alta e de baixa. Dá poucos sinais.'),
  bb: {
    what: 'Três linhas ao redor do preço: uma média de 20 candles no meio e duas bandas, uma acima e outra abaixo, afastadas conforme a oscilação recente (volatilidade).',
    read: 'Bandas abertas = mercado agitado; bandas estreitas = mercado calmo, que costuma anteceder um movimento forte. Preço colado na banda de cima está “esticado” para cima; na de baixo, esticado para baixo.',
    signal: 'Compra quando o candle fecha abaixo da banda inferior; venda quando fecha acima da superior. A ideia é que o preço tende a voltar para a média.',
    care: 'Em tendência forte o preço pode “andar colado” na banda e continuar na mesma direção, então o sinal de reversão falha.',
  },
  rsi: {
    what: 'Mede, de 0 a 100, se o preço subiu ou caiu demais e rápido demais nos últimos 14 candles.',
    read: 'Acima de 70 = sobrecomprado (subiu muito, pode corrigir). Abaixo de 30 = sobrevendido (caiu muito, pode reagir). Entre 30 e 70 = zona neutra.',
    signal: 'Compra quando o RSI sai da zona abaixo de 30 e volta para cima; venda quando sai da zona acima de 70 e volta para baixo.',
    care: 'Numa tendência forte o RSI pode ficar muito tempo acima de 70 (ou abaixo de 30) sem o preço reverter.',
  },
  macd: {
    what: 'Compara duas médias do preço (12 e 26 candles). A linha MACD é a diferença entre elas; a linha de sinal (9) é a média dessa diferença. As barras mostram a distância entre as duas linhas.',
    read: 'Barras positivas e crescendo = força compradora; negativas e crescendo = força vendedora. Barras encolhendo indicam que o movimento está perdendo força.',
    signal: 'Compra quando a linha MACD cruza a linha de sinal de baixo para cima; venda quando cruza de cima para baixo.',
    care: 'Atrasa em relação ao preço e dá muitos sinais falsos quando o mercado está lateral.',
  },
  donchian: {
    what: 'Um canal formado pela maior máxima e pela menor mínima dos últimos 20 candles.',
    read: 'Preço rompendo o topo do canal mostra força de alta; rompendo o fundo, força de baixa. Dentro do canal, o mercado está sem direção definida.',
    signal: 'Compra quando o candle fecha acima da máxima dos 20 candles anteriores; venda quando fecha abaixo da mínima.',
    care: 'É uma estratégia de rompimento: acerta pouco, mas costuma ganhar bastante nos acertos. Rompimentos falsos acontecem em mercado lateral.',
  },
  vwap: {
    what: 'Preço médio do dia ponderado pelo volume: mostra o preço “justo” em que a maior parte do dinheiro negociou. Reinicia a cada pregão.',
    read: 'Preço acima da VWAP indica que os compradores dominam o dia; abaixo, os vendedores. Costuma funcionar como suporte ou resistência durante o dia.',
    signal: 'Compra quando o preço cruza a VWAP de baixo para cima; venda quando cruza de cima para baixo.',
    care: 'Faz mais sentido em timeframes curtos (intraday). Em candles diários ou maiores ela perde o sentido, porque reinicia a cada dia.',
  },
  stoch: {
    what: 'Mostra onde o preço fechou dentro da faixa de máxima e mínima dos últimos 14 candles, de 0 a 100. Tem duas linhas: %K (rápida) e %D (média dela, mais lenta).',
    read: 'Acima de 80 = perto do topo da faixa (sobrecomprado). Abaixo de 20 = perto do fundo (sobrevendido).',
    signal: 'Compra quando %K cruza %D para cima estando abaixo de 20; venda quando %K cruza %D para baixo estando acima de 80.',
    care: 'Muito sensível: gera muitos sinais, e em tendência forte as zonas de 20 e 80 enganam.',
  },
  adx: {
    what: 'Mede a força da tendência, sem dizer a direção. Vem com duas linhas de direção: +DI (compradores) e −DI (vendedores).',
    read: 'ADX acima de 25 = tendência forte; abaixo de 20 = mercado lateral. Quem está por cima, +DI ou −DI, mostra quem domina.',
    signal: 'Só dá sinal com ADX acima de 25: compra quando +DI cruza −DI para cima; venda quando cruza para baixo.',
    care: 'Dá poucos sinais, porque exige tendência forte, e chega atrasado: quando o ADX sobe, boa parte do movimento já aconteceu.',
  },
  obv: {
    what: 'Soma o volume dos dias de alta e subtrai o dos dias de baixa. Mostra se o dinheiro está entrando ou saindo do papel.',
    read: 'OBV subindo junto com o preço confirma a alta. Preço subindo com o OBV caindo é sinal de alerta (alta sem volume por trás).',
    signal: 'Compra quando o OBV cruza para cima a própria média de 20 candles; venda quando cruza para baixo.',
    care: 'Depende de o volume ser confiável. Em ativos de pouco volume o indicador fica ruidoso.',
  },
};
