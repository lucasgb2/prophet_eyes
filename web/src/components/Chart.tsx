'use client';
import { useEffect, useRef, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { INDICATORS, INDICATOR_IDS, sma, ema, rsi, macd, bollinger, donchian, vwap, stochastic, adx, obv } from '@/lib/indicators';
import type { Candle } from '@/lib/types';
import type { Trade } from '@/lib/backtest';
import { pricePrecision, type MarketId } from '@/lib/markets';

const line = (t: number[], s: (number | null)[]) => t.flatMap((time, i) => (s[i] == null ? [] : [{ time: time as UTCTimestamp, value: s[i]! }]));

export default function Chart({ candles, indicators, livePrice, showSignals = true, trades = null, market = 'b3', liveCandle = null }: { liveCandle?: Candle | null; market?: MarketId; candles: Candle[]; indicators: string[]; livePrice?: number | null; showSignals?: boolean; trades?: Trade[] | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const mainRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);
  useEffect(() => { try { setLegendOpen(localStorage.getItem('prophet_legend') !== '0'); } catch {} }, []);
  const toggleLegend = () => { const v = !legendOpen; setLegendOpen(v); try { localStorage.setItem('prophet_legend', v ? '1' : '0'); } catch {} };
  const active = INDICATOR_IDS.filter((id) => indicators.includes(id));
  useEffect(() => {
    if (!ref.current || !candles.length) return;
    const el = ref.current;
    const chart: IChartApi = createChart(el, {
      autoSize: true, // acompanha o tamanho do contêiner (largura e altura)
      layout: { background: { color: '#161b22' }, textColor: '#8b949e' },
      grid: { vertLines: { color: '#222a34' }, horzLines: { color: '#222a34' } },
      timeScale: { timeVisible: true },
    });
    const t = candles.map((c) => c.time), p = candles.map((c) => c.close);
    const main = chart.addCandlestickSeries({ upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350' });
    mainRef.current = main;
    // preços de cripto podem ter muitas casas (ex.: 0,00001234); a escala acompanha o último preço
    const prec = pricePrecision(market, candles[candles.length - 1].close);
    main.applyOptions({ priceFormat: { type: 'price', precision: prec, minMove: 10 ** -prec } });
    main.setData(candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })));
    const overlay = (s: (number | null)[], color: string) => chart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false }).setData(line(t, s));
    if (indicators.includes('ema9')) overlay(ema(p, 9), '#ffa657');
    if (indicators.includes('sma20')) overlay(sma(p, 20), '#f0b429');
    if (indicators.includes('sma50')) overlay(sma(p, 50), '#a371f7');
    if (indicators.includes('sma200')) overlay(sma(p, 200), '#ff7b72');
    if (indicators.includes('ema21')) overlay(ema(p, 21), '#39c5cf');
    if (indicators.includes('bb')) { const b = bollinger(p); overlay(b.up, '#6e7681'); overlay(b.mid, '#484f58'); overlay(b.lo, '#6e7681'); }
    if (indicators.includes('donchian')) { const d = donchian(candles); overlay(d.up, '#56d364'); overlay(d.lo, '#56d364'); }
    if (indicators.includes('vwap')) overlay(vwap(candles), '#d2a8ff');
    // Painéis separados: o último ocupa a base do gráfico, usando escalas próprias
    // Os painéis dividem o espaço de forma proporcional: até 20% da altura cada, no máximo 60% no total.
    const panes = ['rsi', 'macd', 'stoch', 'adx', 'obv'].filter((x) => indicators.includes(x)).length;
    const H = panes ? Math.min(0.2, 0.6 / panes) : 0;
    let bottom = 0;
    const pane = (id: string, height: number) => { chart.priceScale(id).applyOptions({ scaleMargins: { top: 1 - bottom - height, bottom } }); bottom += height; };
    if (indicators.includes('rsi')) {
      const s = chart.addLineSeries({ color: '#f778ba', lineWidth: 1, priceScaleId: 'rsi' }); s.setData(line(t, rsi(p)));
      s.createPriceLine({ price: 70, color: '#6e7681', lineWidth: 1, lineStyle: 2, title: '70' });
      s.createPriceLine({ price: 30, color: '#6e7681', lineWidth: 1, lineStyle: 2, title: '30' });
      pane('rsi', H);
    }
    if (indicators.includes('macd')) {
      const m = macd(p);
      chart.addHistogramSeries({ priceScaleId: 'macd', color: '#3d4450' }).setData(t.flatMap((time, i) => m.hist[i] == null ? [] : [{ time: time as UTCTimestamp, value: m.hist[i]!, color: m.hist[i]! >= 0 ? '#26a69a88' : '#ef535088' }]));
      chart.addLineSeries({ color: '#2f81f7', lineWidth: 1, priceScaleId: 'macd' }).setData(line(t, m.line));
      chart.addLineSeries({ color: '#f0883e', lineWidth: 1, priceScaleId: 'macd' }).setData(line(t, m.signal));
      pane('macd', H);
    }
    if (indicators.includes('stoch')) {
      const st = stochastic(candles);
      const k = chart.addLineSeries({ color: '#2f81f7', lineWidth: 1, priceScaleId: 'stoch' }); k.setData(line(t, st.k));
      chart.addLineSeries({ color: '#f0883e', lineWidth: 1, priceScaleId: 'stoch' }).setData(line(t, st.d));
      k.createPriceLine({ price: 80, color: '#6e7681', lineWidth: 1, lineStyle: 2, title: '80' });
      k.createPriceLine({ price: 20, color: '#6e7681', lineWidth: 1, lineStyle: 2, title: '20' });
      pane('stoch', H);
    }
    if (indicators.includes('adx')) {
      const a = adx(candles);
      const m = chart.addLineSeries({ color: '#e6edf3', lineWidth: 2, priceScaleId: 'adx' }); m.setData(line(t, a.adx));
      chart.addLineSeries({ color: '#26a69a', lineWidth: 1, priceScaleId: 'adx' }).setData(line(t, a.plus));
      chart.addLineSeries({ color: '#ef5350', lineWidth: 1, priceScaleId: 'adx' }).setData(line(t, a.minus));
      m.createPriceLine({ price: 25, color: '#6e7681', lineWidth: 1, lineStyle: 2, title: '25' });
      pane('adx', H);
    }
    if (indicators.includes('obv')) {
      chart.addLineSeries({ color: '#79c0ff', lineWidth: 1, priceScaleId: 'obv' }).setData(line(t, obv(candles)));
      pane('obv', H);
    }
    if (trades) {
      // Simulação ativa: mostra entradas (azul) e saídas (verde = ganho, vermelha = perda) em vez das setas dos indicadores
      const marks = trades.flatMap((t) => [
        { time: t.entryTime as UTCTimestamp, position: 'belowBar' as const, shape: 'arrowUp' as const, color: '#2f81f7', text: 'Compra' },
        { time: t.exitTime as UTCTimestamp, position: 'aboveBar' as const, shape: 'arrowDown' as const, color: t.retPct > 0 ? '#26a69a' : '#ef5350', text: `${t.retPct > 0 ? '+' : ''}${t.retPct.toFixed(1)}%${t.open ? ' (aberta)' : ''}` },
      ]);
      const known = new Set(t); // ignora operações de outro papel/timeframe enquanto os candles não atualizam
      main.setMarkers(marks.filter((m) => known.has(m.time as number)).sort((a, b) => (a.time as number) - (b.time as number)));
    } else if (showSignals) {
      // Pontos de sinal: seta verde (compra) abaixo do candle, vermelha (venda) acima, com o nome do indicador
      const marks = INDICATOR_IDS.filter((id) => indicators.includes(id)).flatMap((id) =>
        INDICATORS[id].signals(candles).flatMap((sg, i) => sg === 0 ? [] : [{
          time: candles[i].time as UTCTimestamp,
          position: (sg > 0 ? 'belowBar' : 'aboveBar') as 'belowBar' | 'aboveBar',
          shape: (sg > 0 ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
          color: sg > 0 ? '#26a69a' : '#ef5350',
          text: `🔔 ${id.toUpperCase()}`, // sino amarelo (emoji) destaca o candle com sinal; a sigla diz qual indicador
        }]));
      main.setMarkers(marks.sort((a, b) => (a.time as number) - (b.time as number)));
    }
    main.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: bottom + 0.03 } });
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, indicators, showSignals, trades, market]);
  // Preço real: atualiza só o último candle (visual), sem tocar nos dados guardados nem nos indicadores.
  useEffect(() => {
    const last = candles.at(-1);
    if (!mainRef.current || !last) return;
    // Websocket: o candle completo (inclusive um novo, quando o período vira) vem pronto da Binance
    if (liveCandle && liveCandle.time >= last.time) { mainRef.current.update({ ...liveCandle, time: liveCandle.time as UTCTimestamp }); return; }
    if (livePrice == null) { mainRef.current.update({ ...last, time: last.time as UTCTimestamp }); return; }
    mainRef.current.update({ time: last.time as UTCTimestamp, open: last.open, high: Math.max(last.high, livePrice), low: Math.min(last.low, livePrice), close: livePrice });
  }, [livePrice, liveCandle, candles, indicators]);
  const mode = trades ? 'trades' : showSignals && active.length ? 'signals' : null;
  return (
    <>
      <div ref={ref} className="chartbox" />
      {mode && (
        <div className="legend">
          <button className="legend-head" onClick={toggleLegend} aria-expanded={legendOpen}>Legenda {legendOpen ? '▾' : '▸'}</button>
          {legendOpen && (mode === 'signals' ? (
            <ul>
              <li><span className="lg-bell">🔔</span> Candle com sinal; a sigla ao lado é o indicador que o gerou</li>
              <li><span style={{ color: '#26a69a' }}>▲</span> Seta verde, abaixo do candle: sinal de <b>compra</b></li>
              <li><span style={{ color: '#ef5350' }}>▼</span> Seta vermelha, acima do candle: sinal de <b>venda</b></li>
              {active.map((id) => <li key={id} className="lg-ind"><b>{id.toUpperCase()}</b> = {INDICATORS[id].label}</li>)}
              <li className="lg-note">É a regra do indicador, não recomendação.</li>
            </ul>
          ) : (
            <ul>
              <li><span style={{ color: '#2f81f7' }}>▲</span> Seta azul: <b>entrada</b> (compra na abertura do candle seguinte)</li>
              <li><span style={{ color: '#26a69a' }}>▼</span> Seta verde: <b>saída com ganho</b> (% da operação)</li>
              <li><span style={{ color: '#ef5350' }}>▼</span> Seta vermelha: <b>saída com perda</b></li>
              <li className="lg-note">“(aberta)” = operação ainda em andamento.</li>
            </ul>
          ))}
        </div>
      )}
    </>
  );
}
