'use client';
import { useEffect, useRef } from 'react';
import { INDICATORS, type IndicatorId } from '@/lib/indicators';
import { INDICATOR_HELP } from '@/lib/indicator-help';

/** Janela simples que explica um indicador em linguagem direta. Fecha com Esc, clique fora ou no ×. */
export default function IndicatorHelpModal({ id, onClose }: { id: IndicatorId; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);
  const h = INDICATOR_HELP[id];
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Como funciona: ${INDICATORS[id].label}`}>
        <header><b>{INDICATORS[id].label}</b><button ref={closeRef} aria-label="Fechar" onClick={onClose}>×</button></header>
        <h4>O que é</h4><p>{h.what}</p>
        <h4>Como ler</h4><p>{h.read}</p>
        <h4>Quando o app marca um sinal</h4><p>{h.signal}</p>
        <h4>Cuidado</h4><p>{h.care}</p>
        <p className="muted small">Material educativo: descreve a regra do indicador e não é recomendação de compra ou venda.</p>
      </div>
    </div>
  );
}
