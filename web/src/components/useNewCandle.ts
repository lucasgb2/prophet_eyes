'use client';
import { useEffect, useRef } from 'react';
import { PERIOD_S, retryMs, waitForClose } from '@/lib/next-candle';
import type { Timeframe } from '@/lib/types';

/**
 * Chama `check` quando um candle novo deve ter aparecido: no horário de fechamento do último candle conhecido
 * (repetindo se ele ainda não veio) ou assim que o websocket mostrar um candle mais novo.
 * `check` deve atualizar os candles; quando `lastTime` muda, o agendamento recomeça.
 */
export function useNewCandle(lastTime: number | undefined, tf: Timeframe | undefined, streamTime: number | undefined, check: () => void) {
  const fn = useRef(check);
  fn.current = check;
  useEffect(() => {
    if (lastTime == null || !tf) return;
    let timer: ReturnType<typeof setTimeout>;
    const run = () => {
      if (Date.now() / 1000 < lastTime + PERIOD_S[tf]) { timer = setTimeout(run, waitForClose(lastTime, tf)); return; }
      fn.current();
      timer = setTimeout(run, retryMs(tf));
    };
    timer = setTimeout(run, waitForClose(lastTime, tf));
    return () => clearTimeout(timer);
  }, [lastTime, tf]);
  // websocket: um candle com início posterior ao último que temos = o anterior acabou de fechar
  const newer = lastTime != null && streamTime != null && streamTime > lastTime ? streamTime : null;
  useEffect(() => { if (newer != null) fn.current(); }, [newer]);
}
