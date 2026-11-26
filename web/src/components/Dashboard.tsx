'use client';
import { useEffect, useMemo, useState } from 'react';
import Chart from './Chart';
import SymbolInput from './SymbolInput';
import { TOOLS } from './tools/registry';
import { MARKET_IDS, MARKETS, fmtPrice, type MarketId } from '@/lib/markets';
import { INDICATORS, INDICATOR_IDS, type IndicatorId } from '@/lib/indicators';
import { triggerLevels } from '@/lib/levels';
import { TIMEFRAMES, type Candle } from '@/lib/types';
import type { Suggestion } from '@/lib/suggest';
import type { Trade } from '@/lib/backtest';

type Profile = { id: number; name: string; market: MarketId; symbol: string; timeframe: string; indicators: string[] };
type Quote = { price: number; changePct: number | null };
const j = (url: string, method = 'GET', body?: unknown) =>
  fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

export default function Dashboard() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [sugg, setSugg] = useState<Suggestion[]>([]);
  const [err, setErr] = useState('');
  const [live, setLive] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState('');
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [signals, setSignals] = useState(true);
  const [toolId, setToolId] = useState<string | null>(null);
  const profile = profiles.find((p) => p.id === activeId);
  const tools = TOOLS.filter((t) => !t.markets || (profile && t.markets.includes(profile.market)));
  const tool = tools.find((t) => t.id === toolId);

  useEffect(() => {
    j('/api/profiles').then((r) => r.json()).then((ps: Profile[]) => { setProfiles(ps); setActiveId(ps[0]?.id ?? null); });
    try { setLive(localStorage.getItem('prophet_live') === '1'); setSignals(localStorage.getItem('prophet_signals') !== '0'); } catch {}
  }, []);

  const key = profile && `${profile.market}|${profile.symbol}|${profile.timeframe}`;
  useEffect(() => {
    if (!profile) return;
    setErr(''); setSugg([]);
    const q = `market=${profile.market}&symbol=${profile.symbol}&tf=${profile.timeframe}`;
    j(`/api/candles?${q}`).then(async (r) => (r.ok ? setCandles(await r.json()) : (setCandles([]), setErr((await r.json()).error))));
    j(`/api/suggest?${q}`).then(async (r) => r.ok && setSugg(await r.json()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Preço real (yfinance): consulta a cada 15 s enquanto estiver ligado
  const symbol = profile?.symbol, market = profile?.market;
  useEffect(() => {
    setQuote(null); setQuoteErr('');
    if (!live || !symbol || !market) return;
    let stop = false;
    const tick = async () => {
      const r = await j(`/api/quote?market=${market}&symbol=${symbol}`);
      const body = await r.json();
      if (stop) return;
      if (r.ok) { setQuote(body); setQuoteErr(''); } else setQuoteErr(body.error ?? 'erro');
    };
    tick();
    const id = setInterval(tick, MARKETS[market].quoteEveryMs);
    return () => { stop = true; clearInterval(id); };
  }, [live, symbol, market]);

  const toggleSignals = () => { const v = !signals; setSignals(v); try { localStorage.setItem('prophet_signals', v ? '1' : '0'); } catch {} };
  const levels = useMemo(() => (candles.length && profile ? triggerLevels(candles, profile.indicators.filter((i) => i in INDICATORS) as IndicatorId[]) : []), [candles, profile?.indicators]);
  const px = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const toggleLive = () => { const v = !live; setLive(v); try { localStorage.setItem('prophet_live', v ? '1' : '0'); } catch {} };

  const update = (patch: Partial<Profile>) => {
    if (!profile) return;
    const next = { ...profile, ...patch, ...(patch.symbol ? { name: patch.symbol } : {}) }; // a aba leva o nome do papel
    if (patch.market && patch.market !== profile.market) { next.symbol = MARKETS[patch.market].defaultSymbol; next.name = next.symbol; setCandles([]); setQuote(null); }
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
          <button aria-label="Nova aba" onClick={async () => { const p = await (await j('/api/profiles', 'POST', { market: profile?.market ?? 'b3' })).json(); setProfiles([...profiles, p]); setActiveId(p.id); }}>+</button>
        </div>
        {profile && (
          <>
            <div className="bar">
              <select aria-label="Mercado" value={profile.market} onChange={(e) => update({ market: e.target.value as MarketId })}>
                {MARKET_IDS.map((m) => <option key={m} value={m}>{MARKETS[m].label}</option>)}
              </select>
              <SymbolInput symbol={profile.symbol} market={profile.market} onSelect={(s) => update({ symbol: s })} />
              {TIMEFRAMES.map((t) => <button key={t} className={t === profile.timeframe ? 'on' : ''} onClick={() => update({ timeframe: t })}>{t}</button>)}
              <span className="grow" />
              <button className={live ? 'on' : ''} onClick={toggleLive} title={profile.market === 'b3' ? 'Cotação em tempo quase real via yfinance' : 'Preço ao vivo direto da Binance'}>Preço real</button>
              {live && quote && <span><b>{fmtPrice(profile.market, profile.symbol, quote.price)}</b>{quote.changePct != null && <span style={{ color: quote.changePct >= 0 ? '#26a69a' : '#ef5350' }}> {quote.changePct >= 0 ? '+' : ''}{quote.changePct.toFixed(2)}%</span>}</span>}
              {live && quoteErr && <span className="muted" title={quoteErr}>cotação indisponível</span>}
              <button onClick={async () => { await j(`/api/profiles?id=${profile.id}`, 'DELETE'); const rest = profiles.filter((p) => p.id !== profile.id); setProfiles(rest); setActiveId(rest[0]?.id ?? null); }}>Excluir aba</button>
            </div>
            <div className="bar">
              <span className="muted">Indicadores:</span>
              <button className={signals ? 'on' : ''} onClick={toggleSignals} title="Setas de compra/venda no gráfico para os indicadores ligados">Sinais no gráfico</button>
              <span className="muted">|</span>
              {INDICATOR_IDS.map((id) => <button key={id} className={profile.indicators.includes(id) ? 'on' : ''} onClick={() => toggle(id)}>{INDICATORS[id].label}</button>)}
            </div>
            <div className="workspace">
              <div className="panel chartcol">
                {err ? <span style={{ color: '#f85149' }}>{err}</span> : <Chart market={profile.market} candles={candles} indicators={profile.indicators} livePrice={live ? quote?.price : null} showSignals={signals} trades={trades} />}
              </div>
              <aside className="panel suggest">
                <b>Níveis de sinal</b>
                <p className="muted">Fechamento do candle atual que faria cada indicador ligado dar sinal. Descreve a regra do indicador; não é recomendação.</p>
                {levels.map((l) => (
                  <div className="sug" key={l.id}>
                    <div>
                      <b>{l.label}</b>
                      <div className="muted">
                        {l.active !== 0 && <span style={{ color: l.active > 0 ? '#26a69a' : '#ef5350' }}>sinal de {l.active > 0 ? 'compra' : 'venda'} agora · </span>}
                        {l.buy != null && <span style={{ color: '#26a69a' }}>compra se fechar {l.buy >= candles.at(-1)!.close ? 'acima de' : 'abaixo de'} {px(l.buy)}</span>}
                        {l.buy != null && l.sell != null && ' · '}
                        {l.sell != null && <span style={{ color: '#ef5350' }}>venda se fechar {l.sell >= candles.at(-1)!.close ? 'acima de' : 'abaixo de'} {px(l.sell)}</span>}
                        {l.buy == null && l.sell == null && l.active === 0 && 'sem gatilho a ±15% do preço atual'}
                      </div>
                    </div>
                  </div>))}
                {!levels.length && <span className="muted">Ligue um indicador para ver os níveis.</span>}
                <b style={{ marginTop: 14, display: 'block' }}>Indicadores sugeridos</b>
                <p className="muted">{profile.symbol} · {profile.timeframe}. Ranking histórico: retorno em 3, 5 e 10 candles após cada sinal, já descontado 0,1% de custo por operação. Descreve o passado; não é recomendação.</p>
                {sugg.map((s) => (
                  <div className="sug" key={s.id}>
                    <div><b>{s.label}</b><div className="muted">{s.signals} sinais · acerto {(s.hitRate * 100).toFixed(0)}% · ret. líq. {s.avgReturnPct.toFixed(2)}%</div>
                    {s.hitFirst != null && s.hitSecond != null && <div className="muted" style={{ color: s.stable ? undefined : '#d29922' }}>1ª metade {(s.hitFirst * 100).toFixed(0)}% · 2ª metade {(s.hitSecond * 100).toFixed(0)}%{s.stable ? '' : ' — instável'}</div>}</div>
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
          <div className="toolbody"><tool.Panel ctx={{ market: profile.market, symbol: profile.symbol, timeframe: profile.timeframe, candles, indicators: profile.indicators, onTrades: setTrades }} /></div>
        </section>
      )}
      <nav className="rail" aria-label="Ferramentas">
        {tools.map((t) => (
          <button key={t.id} title={t.title} aria-label={t.title} className={t.id === toolId ? 'on' : ''} onClick={() => setToolId(t.id === toolId ? null : t.id)}>{t.icon}</button>
        ))}
      </nav>
    </div>
  );
}
