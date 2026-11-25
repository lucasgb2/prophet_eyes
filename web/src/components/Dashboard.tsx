'use client';
import { useEffect, useState } from 'react';
import Chart from './Chart';
import SymbolInput from './SymbolInput';
import { TOOLS } from './tools/registry';
import { INDICATORS, INDICATOR_IDS } from '@/lib/indicators';
import { TIMEFRAMES, type Candle } from '@/lib/types';
import type { Suggestion } from '@/lib/suggest';

type Profile = { id: number; name: string; symbol: string; timeframe: string; indicators: string[] };
type Quote = { price: number; changePct: number | null };
const j = (url: string, method = 'GET', body?: unknown) =>
  fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Dashboard() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [sugg, setSugg] = useState<Suggestion[]>([]);
  const [err, setErr] = useState('');
  const [live, setLive] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState('');
  const [toolId, setToolId] = useState<string | null>(null);
  const profile = profiles.find((p) => p.id === activeId);
  const tool = TOOLS.find((t) => t.id === toolId);

  useEffect(() => {
    j('/api/profiles').then((r) => r.json()).then((ps: Profile[]) => { setProfiles(ps); setActiveId(ps[0]?.id ?? null); });
    try { setLive(localStorage.getItem('prophet_live') === '1'); } catch {}
  }, []);

  const key = profile && `${profile.symbol}|${profile.timeframe}`;
  useEffect(() => {
    if (!profile) return;
    setErr(''); setSugg([]);
    const q = `symbol=${profile.symbol}&tf=${profile.timeframe}`;
    j(`/api/candles?${q}`).then(async (r) => (r.ok ? setCandles(await r.json()) : (setCandles([]), setErr((await r.json()).error))));
    j(`/api/suggest?${q}`).then(async (r) => r.ok && setSugg(await r.json()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Preço real (yfinance): consulta a cada 15 s enquanto estiver ligado
  const symbol = profile?.symbol;
  useEffect(() => {
    setQuote(null); setQuoteErr('');
    if (!live || !symbol) return;
    let stop = false;
    const tick = async () => {
      const r = await j(`/api/quote?symbol=${symbol}`);
      const body = await r.json();
      if (stop) return;
      if (r.ok) { setQuote(body); setQuoteErr(''); } else setQuoteErr(body.error ?? 'erro');
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => { stop = true; clearInterval(id); };
  }, [live, symbol]);

  const toggleLive = () => { const v = !live; setLive(v); try { localStorage.setItem('prophet_live', v ? '1' : '0'); } catch {} };

  const update = (patch: Partial<Profile>) => {
    if (!profile) return;
    const next = { ...profile, ...patch, ...(patch.symbol ? { name: patch.symbol } : {}) }; // a aba leva o nome do papel
    setProfiles((ps) => ps.map((p) => (p.id === next.id ? next : p)));
    j('/api/profiles', 'PUT', next);
  };
  const toggle = (id: string) => update({ indicators: profile!.indicators.includes(id) ? profile!.indicators.filter((x) => x !== id) : [...profile!.indicators, id] });

  return (
    <div className="app">
      <div className="main">
        <div className="bar">
          <b>Prophet</b><span className="grow" />
          <button onClick={async () => { await j('/api/auth/logout', 'POST'); location.href = '/login'; }}>Sair</button>
        </div>
        <div className="tabs">
          {profiles.map((p) => <button key={p.id} className={p.id === activeId ? 'on' : ''} onClick={() => setActiveId(p.id)}>{p.symbol}</button>)}
          <button aria-label="Nova aba" onClick={async () => { const p = await (await j('/api/profiles', 'POST', {})).json(); setProfiles([...profiles, p]); setActiveId(p.id); }}>+</button>
        </div>
        {profile && (
          <>
            <div className="bar">
              <SymbolInput symbol={profile.symbol} onSelect={(s) => update({ symbol: s })} />
              {TIMEFRAMES.map((t) => <button key={t} className={t === profile.timeframe ? 'on' : ''} onClick={() => update({ timeframe: t })}>{t}</button>)}
              <span className="grow" />
              <button className={live ? 'on' : ''} onClick={toggleLive} title="Cotação em tempo quase real via yfinance">Preço real</button>
              {live && quote && <span><b>{brl(quote.price)}</b>{quote.changePct != null && <span style={{ color: quote.changePct >= 0 ? '#26a69a' : '#ef5350' }}> {quote.changePct >= 0 ? '+' : ''}{quote.changePct.toFixed(2)}%</span>}</span>}
              {live && quoteErr && <span className="muted" title={quoteErr}>cotação indisponível</span>}
              <button onClick={async () => { await j(`/api/profiles?id=${profile.id}`, 'DELETE'); const rest = profiles.filter((p) => p.id !== profile.id); setProfiles(rest); setActiveId(rest[0]?.id ?? null); }}>Excluir aba</button>
            </div>
            <div className="bar">
              <span className="muted">Indicadores:</span>
              {INDICATOR_IDS.map((id) => <button key={id} className={profile.indicators.includes(id) ? 'on' : ''} onClick={() => toggle(id)}>{INDICATORS[id].label}</button>)}
            </div>
            <div className="workspace">
              <div className="panel chartcol">
                {err ? <span style={{ color: '#f85149' }}>{err}</span> : <Chart candles={candles} indicators={profile.indicators} livePrice={live ? quote?.price : null} />}
              </div>
              <aside className="panel suggest">
                <b>Indicadores sugeridos</b>
                <p className="muted">{profile.symbol} · {profile.timeframe}. Ranking histórico (retorno 5 candles após cada sinal). Descreve o passado; não é recomendação.</p>
                {sugg.map((s) => (
                  <div className="sug" key={s.id}>
                    <div><b>{s.label}</b><div className="muted">{s.signals} sinais · acerto {(s.hitRate * 100).toFixed(0)}% · ret. médio {s.avgReturnPct.toFixed(2)}%</div></div>
                    <button disabled={profile.indicators.includes(s.id)} onClick={() => toggle(s.id)}>{profile.indicators.includes(s.id) ? 'Em uso' : 'Aplicar'}</button>
                  </div>))}
                {!sugg.length && <span className="muted">Sem dados suficientes de sinais.</span>}
              </aside>
            </div>
          </>
        )}
      </div>
      {tool && profile && (
        <section className="toolpanel">
          <header><b>{tool.title}</b><button aria-label="Fechar" onClick={() => setToolId(null)}>×</button></header>
          <div className="toolbody"><tool.Panel ctx={{ symbol: profile.symbol, timeframe: profile.timeframe }} /></div>
        </section>
      )}
      <nav className="rail" aria-label="Ferramentas">
        {TOOLS.map((t) => (
          <button key={t.id} title={t.title} aria-label={t.title} className={t.id === toolId ? 'on' : ''} onClick={() => setToolId(t.id === toolId ? null : t.id)}>{t.icon}</button>
        ))}
      </nav>
    </div>
  );
}
