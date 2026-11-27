'use client';
import { useEffect, useState } from 'react';
import type { HistoryStatus } from '@/lib/history-status';

/** Andamento do histórico longo da B3 do papel aberto. `onReload` recarrega o gráfico depois de concluir. */
export default function HistoryBadge({ symbol, onReload }: { symbol: string; onReload: () => void }) {
  const [status, setStatus] = useState<HistoryStatus | null>(null);
  const [fresh, setFresh] = useState(false); // concluiu com esta tela aberta: o gráfico ainda mostra os dados antigos

  useEffect(() => {
    setStatus(null); setFresh(false);
    let stop = false, waiting = false, imported: number | undefined, timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      const r = await fetch(`/api/history?symbol=${encodeURIComponent(symbol)}`).catch(() => null);
      const s: HistoryStatus | null = r?.ok ? await r.json().catch(() => null) : null;
      if (stop) return;
      if (s) {
        setStatus(s);
        if (s.state === 'done') {
          if (waiting || (imported != null && s.imported !== imported)) setFresh(true);
          imported = s.imported;
        }
        else setFresh(false);
        waiting = s.state === 'pending' || s.state === 'locating' || s.state === 'downloading' || s.state === 'error';
      }
      // rápido enquanto há trabalho; devagar depois (um desdobramento pode disparar nova importação)
      if (s?.state !== 'off') timer = setTimeout(load, !s || waiting ? 3000 : 60_000);
    };
    load();
    return () => { stop = true; clearTimeout(timer); };
  }, [symbol]);

  if (!status || status.state === 'off') return null;
  if (fresh) return (
    <span className="histstatus ok" role="status">
      Histórico concluído <button onClick={() => { setFresh(false); onReload(); }}>Atualizar gráfico</button>
    </span>);
  const since = status.since ? new Date(status.since * 1000).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' }) : null;
  const text = {
    pending: 'Papel sem histórico longo · na fila para buscar na B3',
    locating: 'Localizando histórico na B3…',
    downloading: `Baixando histórico da B3${status.detail ? `: ${status.detail}` : '…'}`,
    done: `Histórico diário desde ${since}`,
    empty: 'Papel não encontrado no histórico da B3',
    error: 'Falha ao baixar o histórico da B3 · nova tentativa em até 6 h',
  }[status.state];
  return <span className={`histstatus ${status.state === 'pending' || status.state === 'done' || status.state === 'empty' ? 'muted ' : ''}${status.state}`} role="status">{text}</span>;
}
