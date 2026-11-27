'use client';
import { useEffect, useState } from 'react';
import { beep } from '../useSignalNotifier';
import { CATEGORIES, type Category } from '@/lib/news/parse';

type Bell = { facts: boolean; categories: Category[] };

/** Sino de notícias do papel: o que avisar (no navegador e no Telegram). */
export default function NewsBell({ market, symbol }: { market: string; symbol: string }) {
  const [bell, setBell] = useState<Bell | null>(null);
  const [telegram, setTelegram] = useState(false);
  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState('');
  const b3 = market === 'b3';

  useEffect(() => {
    setReady(false); setMsg('');
    let stop = false;
    fetch(`/api/news/bells?market=${market}&symbol=${symbol}`).then((r) => r.json()).then((b) => { if (!stop) { setBell(b.bell ?? null); setTelegram(!!b.telegram); setReady(true); } }).catch(() => {});
    return () => { stop = true; };
  }, [market, symbol]);

  const save = async (next: Bell | null) => {
    const prev = bell;
    setBell(next); setMsg('');
    const r = await fetch('/api/news/bells', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ market, symbol, bell: next }) }).catch(() => null);
    if (!r?.ok) { setBell(prev); setMsg('Não foi possível salvar o sino.'); }
  };

  const toggle = async () => {
    if (bell) return save(null);
    beep(1); // o clique libera o áudio
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') await Notification.requestPermission();
    // B3 começa só com os fatos oficiais; cripto não tem fonte oficial, então começa por um assunto
    await save({ facts: b3, categories: b3 ? [] : ['juridico'] });
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') setMsg('Notificações bloqueadas no navegador: só o som será usado.');
  };

  const flip = (c: Category) => bell && save({ ...bell, categories: bell.categories.includes(c) ? bell.categories.filter((x) => x !== c) : [...bell.categories, c] });

  if (!ready) return null;
  return (
    <section className="newsbell">
      <button className={bell ? 'on' : ''} aria-pressed={!!bell} onClick={toggle}>{bell ? '🔔' : '🔕'} {bell ? `Avisando notícias de ${symbol}` : `Avisar notícias de ${symbol}`}</button>
      {bell && (
        <>
          {b3 && <label><input type="checkbox" checked={bell.facts} onChange={() => save({ ...bell, facts: !bell.facts })} /> Fatos relevantes e comunicados (CVM)</label>}
          <p className="muted">Também avisar estes assuntos:</p>
          <div className="newscats">
            {(Object.keys(CATEGORIES) as Category[]).map((c) => <label key={c}><input type="checkbox" checked={bell.categories.includes(c)} onChange={() => flip(c)} /> {CATEGORIES[c]}</label>)}
          </div>
          {!bell.facts && !bell.categories.length && <p className="warn">Nada marcado: nenhum aviso será enviado.</p>}
          <p className="muted">{telegram ? 'Avisa no navegador (com o app aberto) e no Telegram.' : 'Avisa no navegador com o app aberto. Cadastre o chat no painel Telegram para receber também lá.'}{b3 ? ' A CVM publica o arquivo uma vez por semana: esses fatos podem chegar com dias de atraso.' : ''}</p>
        </>
      )}
      {msg && <p className="warn">{msg}</p>}
    </section>
  );
}
