'use client';
import { useEffect, useRef, useState } from 'react';
import { MARKETS, validSymbol, type MarketId } from '@/lib/markets';

type Asset = { symbol: string; name: string };

export default function SymbolInput({ symbol, market = 'b3', env = 'production', onSelect }: { symbol: string; market?: MarketId; env?: string; onSelect: (s: string) => void }) {
  const [text, setText] = useState(symbol);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Asset[]>([]);
  const [hi, setHi] = useState(0);
  const seq = useRef(0);

  useEffect(() => setText(symbol), [symbol]);

  // Ao focar mostra os papéis mais comuns; ao digitar filtra por código ou nome da empresa.
  useEffect(() => {
    if (!open) return;
    const id = ++seq.current;
    const q = text === symbol ? '' : text.trim();
    const t = setTimeout(async () => {
      const r = await fetch(`/api/assets?market=${market}&env=${env}&q=${encodeURIComponent(q)}`);
      if (r.ok && id === seq.current) { setItems(await r.json()); setHi(0); }
    }, 150);
    return () => clearTimeout(t);
  }, [text, open, symbol, market, env]);

  const pick = (s: string) => { const v = s.toUpperCase(); setOpen(false); if (validSymbol(market, v)) onSelect(v); else setText(symbol); };

  return (
    <div className="combo">
      <input value={text} placeholder={MARKETS[market].placeholder} aria-label="Ativo" style={{ width: 150 }} autoComplete="off"
        onFocus={(e) => { e.target.select(); setOpen(true); }}
        onBlur={() => setTimeout(() => { setOpen(false); setText(symbol); }, 120)}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, items.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(items[hi]?.symbol ?? text); }
          else if (e.key === 'Escape') { setOpen(false); setText(symbol); }
        }} />
      {open && items.length > 0 && (
        <ul className="combo-list">
          {items.map((a, i) => (
            <li key={a.symbol} className={i === hi ? 'hi' : ''} onMouseDown={(e) => { e.preventDefault(); pick(a.symbol); }}>
              <b>{a.symbol}</b><span className="muted"> {a.name}</span>
            </li>))}
        </ul>
      )}
    </div>
  );
}
