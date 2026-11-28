'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { IndicatorId } from '@/lib/indicators';
import { latestSignal, signalBody, signalKey, signalTitle } from '@/lib/signal-watch';
import type { Candle, Timeframe } from '@/lib/types';

const KEY = 'prophet_notify', SEEN = 'prophet_notified', EVERY_MS = 60_000;
const read = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? '') as T; } catch { return d; } };

let ctx: AudioContext | null = null;
/** Aviso sonoro: dois tons subindo (compra) ou descendo (venda). Só toca depois de um clique do usuário (regra do navegador). */
export function beep(side: 1 | -1) {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime, freqs = side > 0 ? [660, 880] : [880, 660];
    freqs.forEach((f, i) => {
      const o = ctx!.createOscillator(), g = ctx!.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + i * 0.22); g.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.22 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.22 + 0.2);
      o.connect(g).connect(ctx!.destination); o.start(t0 + i * 0.22); o.stop(t0 + i * 0.22 + 0.21);
    });
  } catch {}
}

type Target = { market: string; symbol: string; timeframe: string } | undefined;

/**
 * Sino por indicador: quando ligado, o navegador avisa (notificação + som) se o indicador der sinal no candle atual do papel
 * da aba ativa. Só funciona com o app aberto; cada sinal (indicador + candle + direção) avisa uma única vez.
 */
export function useSignalNotifier(target: Target, env: string, ready: boolean) {
  const [on, setOn] = useState<IndicatorId[]>([]);
  const [note, setNote] = useState('');
  const seen = useRef<Set<string>>(new Set());
  const [telegram, setTelegram] = useState(false);
  const save = (bells: IndicatorId[]) => fetch('/api/notify', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bells }) }).catch(() => {});
  useEffect(() => {
    seen.current = new Set(read<string[]>(SEEN, []));
    // os sinos ficam no banco (o worker usa os mesmos para avisar pelo Telegram); sinos antigos do navegador são migrados uma vez
    fetch('/api/notify').then((r) => r.json()).then((b) => {
      setTelegram(!!b.telegram);
      let bells: IndicatorId[] = b.bells ?? [];
      const old = read<IndicatorId[]>(KEY, []);
      if (!bells.length && old.length) { bells = old; save(old); }
      try { localStorage.removeItem(KEY); } catch {}
      setOn(bells);
    }).catch(() => {});
  }, []);

  const toggle = useCallback(async (id: IndicatorId) => {
    const next = on.includes(id) ? on.filter((x) => x !== id) : [...on, id];
    setOn(next); save(next);
    if (!next.includes(id)) return;
    beep(1); // o clique libera o áudio; serve também de teste do som
    if (typeof Notification === 'undefined') setNote('Este navegador não suporta notificações; só o som será usado.');
    else if (Notification.permission === 'default') {
      const p = await Notification.requestPermission();
      setNote(p === 'granted' ? '' : 'Notificações bloqueadas no navegador: só o som será usado. Libere nas permissões do site.');
    } else setNote(Notification.permission === 'denied' ? 'Notificações bloqueadas no navegador: só o som será usado. Libere nas permissões do site.' : '');
  }, [on]);

  const tgt = target && `${target.market}|${target.symbol}|${target.timeframe}`;
  useEffect(() => {
    if (!target || !ready || !on.length) return;
    let stop = false;
    const check = async () => {
      const r = await fetch(`/api/candles?market=${target.market}&symbol=${target.symbol}&tf=${target.timeframe}&env=${env}`).catch(() => null);
      if (stop || !r?.ok) return;
      const candles: Candle[] = await r.json();
      const last = candles.at(-1);
      if (stop || !last) return;
      for (const id of on) {
        const f = latestSignal(candles, id, target.timeframe as Timeframe);
        if (!f) continue;
        const k = signalKey(`${env}|${target.market}|${target.symbol}|${target.timeframe}`, f);
        if (seen.current.has(k)) continue;
        seen.current.add(k);
        try { localStorage.setItem(SEEN, JSON.stringify([...seen.current].slice(-200))); } catch {}
        const title = signalTitle(target.symbol, target.timeframe, f), body = signalBody(f);
        beep(f.side);
        try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(title, { body, tag: k }); } catch {}
      }
    };
    check(); const t = setInterval(check, EVERY_MS);
    return () => { stop = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tgt, env, ready, on]);

  return { on, toggle, note, telegram };
}
