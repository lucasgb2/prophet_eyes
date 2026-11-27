'use client';
import { useEffect, useRef, type ReactNode } from 'react';

/** Janela modal simples: fecha com Esc, clique fora ou no ×, e devolve o foco a quem a abriu. */
export default function Modal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // onClose muda a cada render do pai; guardá-lo num ref evita refazer o efeito (que devolveria o foco ao × e rolaria o modal)
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, []);
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={wide ? 'modal wide' : 'modal'} role="dialog" aria-modal="true" aria-label={title}>
        <header><b>{title}</b><button ref={closeRef} aria-label="Fechar" onClick={onClose}>×</button></header>
        {children}
      </div>
    </div>
  );
}
