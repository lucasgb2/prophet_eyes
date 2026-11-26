'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Env } from '@/lib/binance';

const KEY = 'prophet_binance_env', EVT = 'prophet-binance-env';

/** Ambiente da Binance escolhido (homologação ou produção), compartilhado entre a barra e o painel Operar. */
export function useBinanceEnv(): [Env, (e: Env) => void] {
  const [env, setEnvState] = useState<Env>('testnet');
  useEffect(() => {
    const read = () => { try { setEnvState(localStorage.getItem(KEY) === 'production' ? 'production' : 'testnet'); } catch {} };
    read();
    window.addEventListener(EVT, read);
    window.addEventListener('storage', read);
    return () => { window.removeEventListener(EVT, read); window.removeEventListener('storage', read); };
  }, []);
  const setEnv = useCallback((e: Env) => {
    try { localStorage.setItem(KEY, e); } catch {}
    setEnvState(e);
    window.dispatchEvent(new Event(EVT));
  }, []);
  return [env, setEnv];
}
