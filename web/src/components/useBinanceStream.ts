'use client';
import { useEffect, useState } from 'react';
import type { Candle } from '@/lib/types';

// Intervalos do stream de klines (iguais aos do REST, ver lib/binance.ts)
const STREAM_INTERVAL: Record<string, string> = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '60m': '1h', '1d': '1d', '1wk': '1w', '1mo': '1M' };
const BASE = process.env.NEXT_PUBLIC_BINANCE_WS_URL || 'wss://data-stream.binance.vision';
const BASE_TEST = process.env.NEXT_PUBLIC_BINANCE_TESTNET_WS_URL || 'wss://stream.testnet.binance.vision';

export type StreamState = { connected: boolean; candle: Candle | null; price: number | null; changePct: number | null };
const EMPTY: StreamState = { connected: false, candle: null, price: null, changePct: null };

/**
 * Websocket público da Binance (sem chave): kline do timeframe + miniTicker (variação 24h).
 * Reconecta com espera crescente; enquanto não estiver conectado, quem usa o hook cai no polling HTTP.
 */
export function useBinanceStream(enabled: boolean, symbol: string | undefined, timeframe: string | undefined, env: 'testnet' | 'production' = 'production'): StreamState {
  const [st, setSt] = useState<StreamState>(EMPTY);
  useEffect(() => {
    setSt(EMPTY);
    const iv = timeframe && STREAM_INTERVAL[timeframe];
    if (!enabled || !symbol || !iv || typeof WebSocket === 'undefined') return;
    const s = symbol.toLowerCase();
    let ws: WebSocket | null = null, timer: ReturnType<typeof setTimeout> | undefined, stop = false, tries = 0;
    const open = () => {
      ws = new WebSocket(`${env === 'testnet' ? BASE_TEST : BASE}/stream?streams=${s}@kline_${iv}/${s}@miniTicker`);
      ws.onopen = () => { tries = 0; setSt((x) => ({ ...x, connected: true })); };
      ws.onmessage = (ev) => {
        try {
          const { stream, data } = JSON.parse(ev.data as string);
          if (typeof stream !== 'string') return;
          if (stream.endsWith(`@kline_${iv}`) && data?.k) {
            const k = data.k;
            const candle = { time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v } as Candle;
            setSt((x) => ({ ...x, candle, price: candle.close }));
          } else if (stream.endsWith('@miniTicker')) {
            const c = +data.c, o = +data.o;
            setSt((x) => ({ ...x, price: x.candle ? x.price : c, changePct: o ? ((c - o) / o) * 100 : null }));
          }
        } catch {}
      };
      ws.onclose = () => {
        setSt((x) => ({ ...x, connected: false }));
        if (!stop) timer = setTimeout(open, Math.min(30000, 1000 * 2 ** tries++));
      };
      ws.onerror = () => ws?.close();
    };
    open();
    return () => { stop = true; clearTimeout(timer); if (ws) { ws.onclose = null; ws.close(); } };
  }, [enabled, symbol, timeframe, env]);
  return st;
}
