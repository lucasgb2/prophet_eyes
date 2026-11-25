'use client';
import { useEffect, useRef } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { sma, ema, rsi, macd, bollinger } from '@/lib/indicators';
import type { Candle } from '@/lib/types';

const line = (t: number[], s: (number | null)[]) => t.flatMap((time, i) => (s[i] == null ? [] : [{ time: time as UTCTimestamp, value: s[i]! }]));

export default function Chart({ candles, indicators, livePrice }: { candles: Candle[]; indicators: string[]; livePrice?: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const mainRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  useEffect(() => {
    if (!ref.current || !candles.length) return;
    const el = ref.current;
    const chart: IChartApi = createChart(el, {
      width: el.clientWidth, height: 560,
      layout: { background: { color: '#161b22' }, textColor: '#8b949e' },
      grid: { vertLines: { color: '#222a34' }, horzLines: { color: '#222a34' } },
      timeScale: { timeVisible: true },
    });
    const t = candles.map((c) => c.time), p = candles.map((c) => c.close);
    const main = chart.addCandlestickSeries({ upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350' });
    mainRef.current = main;
    main.setData(candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })));
    const overlay = (s: (number | null)[], color: string) => chart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false }).setData(line(t, s));
    if (indicators.includes('sma20')) overlay(sma(p, 20), '#f0b429');
    if (indicators.includes('sma50')) overlay(sma(p, 50), '#a371f7');
    if (indicators.includes('ema21')) overlay(ema(p, 21), '#39c5cf');
    if (indicators.includes('bb')) { const b = bollinger(p); overlay(b.up, '#6e7681'); overlay(b.mid, '#484f58'); overlay(b.lo, '#6e7681'); }
    // Painéis separados: o último ocupa a base do gráfico, usando escalas próprias
    let bottom = 0;
    const pane = (id: string, height: number) => { chart.priceScale(id).applyOptions({ scaleMargins: { top: 1 - bottom - height, bottom } }); bottom += height; };
    if (indicators.includes('rsi')) {
      const s = chart.addLineSeries({ color: '#f778ba', lineWidth: 1, priceScaleId: 'rsi' }); s.setData(line(t, rsi(p)));
      s.createPriceLine({ price: 70, color: '#6e7681', lineWidth: 1, lineStyle: 2, title: '70' });
      s.createPriceLine({ price: 30, color: '#6e7681', lineWidth: 1, lineStyle: 2, title: '30' });
      pane('rsi', 0.15);
    }
    if (indicators.includes('macd')) {
      const m = macd(p);
      chart.addHistogramSeries({ priceScaleId: 'macd', color: '#3d4450' }).setData(t.flatMap((time, i) => m.hist[i] == null ? [] : [{ time: time as UTCTimestamp, value: m.hist[i]!, color: m.hist[i]! >= 0 ? '#26a69a88' : '#ef535088' }]));
      chart.addLineSeries({ color: '#2f81f7', lineWidth: 1, priceScaleId: 'macd' }).setData(line(t, m.line));
      chart.addLineSeries({ color: '#f0883e', lineWidth: 1, priceScaleId: 'macd' }).setData(line(t, m.signal));
      pane('macd', 0.15);
    }
    main.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: bottom + 0.03 } });
    chart.timeScale().fitContent();
    const onResize = () => chart.applyOptions({ width: el.clientWidth });
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); chart.remove(); };
  }, [candles, indicators]);
  // Preço real: atualiza só o último candle (visual), sem tocar nos dados guardados nem nos indicadores.
  useEffect(() => {
    const last = candles.at(-1);
    if (!mainRef.current || !last) return;
    if (livePrice == null) { mainRef.current.update({ ...last, time: last.time as UTCTimestamp }); return; }
    mainRef.current.update({ time: last.time as UTCTimestamp, open: last.open, high: Math.max(last.high, livePrice), low: Math.min(last.low, livePrice), close: livePrice });
  }, [livePrice, candles, indicators]);
  return <div ref={ref} />;
}
