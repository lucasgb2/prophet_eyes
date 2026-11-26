'use client';
import { useEffect, useRef, type ReactNode } from 'react';

/** Janela modal simples: fecha com Esc, clique fora ou no ×, e devolve o foco a quem a abriu. */
export default function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header><b>{title}</b><button ref={closeRef} aria-label="Fechar" onClick={onClose}>×</button></header>
        {children}
      </div>
    </div>
  );
}
