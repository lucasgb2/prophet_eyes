'use client';
import { useEffect, useState } from 'react';
import { when, type Problem } from '@/lib/health';

/** Faixa no topo quando alguma tarefa de fundo parou; some sozinha quando volta. */
export default function HealthBanner() {
  const [problems, setProblems] = useState<Problem[]>([]);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      const r = await fetch('/api/health').catch(() => null);
      if (r?.ok && !stop) setProblems(await r.json());
    };
    load(); const t = setInterval(load, 60_000);
    return () => { stop = true; clearInterval(t); };
  }, []);
  if (!problems.length) return null;
  return (
    <div className="health" role="alert">
      ⚠️ Parado: {problems.map((p) => `${p.label} (${p.okAt == null ? 'sem registro' : `desde ${when(p.okAt)}`})`).join(' · ')}.
      {problems.some((p) => p.name !== 'backup') && ' Não confie na falta de avisos enquanto isso.'}
    </div>
  );
}
