'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Chart, { type ChartOrder, type NewsMark } from './Chart';
import SymbolInput from './SymbolInput';
import MarketLogo from './MarketLogo';
import HistoryBadge from './HistoryBadge';
import { TOOLS } from './tools/registry';
import IndicatorHelpModal from './IndicatorHelpModal';
import RankingHelpModal from './RankingHelpModal';
import { useSignalNotifier } from './useSignalNotifier';
import { useNewsNotifier } from './useNewsNotifier';
import { useBinanceEnv } from './useBinanceEnv';
import { useNewCandle } from './useNewCandle';
import { useBinanceStream } from './useBinanceStream';
import { MARKET_IDS, MARKETS, fmtPrice, type MarketId } from '@/lib/markets';
import { INDICATORS, INDICATOR_IDS, type IndicatorId } from '@/lib/indicators';
import { triggerLevels } from '@/lib/levels';
import { TIMEFRAMES, type Candle, type Timeframe } from '@/lib/types';
import type { Suggestion } from '@/lib/suggest';
import type { Trade } from '@/lib/backtest';
import type { NewsResponse } from '@/lib/news/types';

type Profile = { id: number; name: string; market: MarketId; symbol: string; timeframe: string; indicators: string[] };
type Quote = { price: number; changePct: number | null };
const j = (url: string, method = 'GET', body?: unknown) =>
  fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

export default function Dashboard() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  // de qual mercado/papel/timeframe são os candles na tela (não o selecionado, que muda antes de os dados chegarem)
  const [candlesKey, setCandlesKey] = useState('');
  const [sugg, setSugg] = useState<Suggestion[]>([]);
  const [err, setErr] = useState('');
  const [live, setLive] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState('');
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [rankHelp, setRankHelp] = useState(false); // explicação do ranking aberta
  const [helpId, setHelpId] = useState<IndicatorId | null>(null); // indicador cuja explicação está aberta
  const [planB3, setPlanB3] = useState<string[] | null>(null);
  const [freeB3, setFreeB3] = useState<string[]>([]); // papéis de teste da brapi, sem limite de timeframe
  const blocked = (tf: string, p: { market: string; symbol: string }) => p.market === 'b3' && planB3 != null && !planB3.includes(tf) && !freeB3.includes(p.symbol); // timeframes liberados no plano da brapi (null = sem restrição conhecida)
  const [signals, setSignals] = useState(true);
  const [showNews, setShowNews] = useState(false); // marcar no gráfico os candles com notícia do papel
  const [newsMarks, setNewsMarks] = useState<NewsMark[]>([]);
  const [toolId, setToolId] = useState<string | null>(null);
  const profile = profiles.find((p) => p.id === activeId);
  const [binEnv, , envReady] = useBinanceEnv();
  const dataEnv = profile?.market === 'binance' ? binEnv : 'production'; // B3 não tem ambiente de teste
  const q_env = `&env=${dataEnv}`;
  const notifier = useSignalNotifier(profile, dataEnv, envReady);
  useNewsNotifier();
  const tools = TOOLS.filter((t) => !t.markets || (profile && t.markets.includes(profile.market)));
  const tool = tools.find((t) => t.id === toolId);

  useEffect(() => {
    j('/api/profiles').then((r) => r.json()).then((ps: Profile[]) => { setProfiles(ps); setActiveId(ps[0]?.id ?? null); });
    j('/api/plan').then((r) => r.json()).then((b) => { setPlanB3(Array.isArray(b.b3) ? b.b3 : null); setFreeB3(Array.isArray(b.free) ? b.free : []); }).catch(() => {});
    try { setLive(localStorage.getItem('prophet_live') === '1'); setSignals(localStorage.getItem('prophet_signals') !== '0'); setShowNews(localStorage.getItem('prophet_news') === '1'); } catch {}
  }, []);

  const key = profile && envReady && `${profile.market}|${dataEnv}|${profile.symbol}|${profile.timeframe}`;
  const keyRef = useRef(key);
  keyRef.current = key;
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null); // quando o ranking e os gatilhos foram calculados
  const [reload, setReload] = useState(0); // recarga pedida depois de importar o histórico
  useEffect(() => {
    if (!profile || !envReady) return;
    setErr(''); setSugg([]); setUpdatedAt(null);
    const q = `market=${profile.market}&symbol=${profile.symbol}&tf=${profile.timeframe}${q_env}`;
    // Se o usuário trocar de papel/timeframe antes da resposta chegar, a resposta velha é descartada
    let stale = false;
    j(`/api/candles?${q}`).then(async (r) => { const body = await r.json(); if (stale) return; if (r.ok) { setCandles(body); setCandlesKey(`${key}|${reload}`); } else { setCandles([]); setErr(body.error); } }).catch(() => {});
    j(`/api/suggest?${q}`).then(async (r) => { const body = await r.json(); if (!stale && r.ok) { setSugg(body); setUpdatedAt(new Date()); } }).catch(() => {});
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reload]);

  // Preço real (yfinance): consulta a cada 15 s enquanto estiver ligado
  const symbol = profile?.symbol, market = profile?.market;
  // Binance: websocket público (tempo real); o polling HTTP só roda enquanto o websocket não estiver conectado
  const stream = useBinanceStream(live && market === 'binance' && envReady, symbol, profile?.timeframe, dataEnv);
  const viaWs = market === 'binance' && stream.connected && stream.price != null;

  // Notícias no gráfico: cada notícia cai no primeiro candle que podia reagir a ela
  const timeframe = profile?.timeframe;
  useEffect(() => {
    setNewsMarks([]);
    if (!showNews || !symbol || !market || !timeframe) return;
    let stop = false;
    const load = async () => {
      const r = await j(`/api/news?market=${market}&symbol=${symbol}&tf=${timeframe}`).catch(() => null);
      if (!r?.ok || stop) return;
      const body: NewsResponse = await r.json();
      if (stop) return;
      const count = new Map<number, number>();
      for (const n of body.symbol) if (n.reaction?.firstTime != null) count.set(n.reaction.firstTime, (count.get(n.reaction.firstTime) ?? 0) + 1);
      setNewsMarks([...count].map(([time, c]) => ({ time, count: c })));
    };
    load(); const t = setInterval(load, 5 * 60_000);
    return () => { stop = true; clearInterval(t); };
  }, [showNews, symbol, market, timeframe]);

  // Candle novo (o anterior fechou): busca os candles e refaz o backtest/gatilhos, sem limpar a tela
  const refreshing = useRef(false);
  const lastTime = candles.at(-1)?.time;
  useNewCandle(lastTime, profile?.timeframe as Timeframe | undefined, live && viaWs ? stream.candle?.time : undefined, async () => {
    if (!profile || !envReady || lastTime == null || refreshing.current) return;
    const asked = key, q = `market=${profile.market}&symbol=${profile.symbol}&tf=${profile.timeframe}${q_env}`;
    refreshing.current = true;
    try {
      const r = await j(`/api/candles?${q}`);
      if (!r.ok) return;
      const body: Candle[] = await r.json();
      if (keyRef.current !== asked || (body.at(-1)?.time ?? 0) <= lastTime) return; // trocou de papel, ou o candle novo ainda não veio
      const s = await j(`/api/suggest?${q}`);
      const next = s.ok ? await s.json() : null;
      if (keyRef.current !== asked) return;
      setCandles(body);
      if (next) { setSugg(next); setUpdatedAt(new Date()); }
    } catch {} finally { refreshing.current = false; }
  });
  useEffect(() => {
    setQuote(null); setQuoteErr('');
    if (!live || !symbol || !market || viaWs || !envReady) return;
    let stop = false;
    const tick = async () => {
      const r = await j(`/api/quote?market=${market}&symbol=${symbol}${q_env}`);
      const body = await r.json();
      if (stop) return;
      if (r.ok) { setQuote(body); setQuoteErr(''); } else setQuoteErr(body.error ?? 'erro');
    };
    tick();
    const id = setInterval(tick, MARKETS[market].quoteEveryMs);
    return () => { stop = true; clearInterval(id); };
  }, [live, symbol, market, viaWs, dataEnv, envReady]);
  // Binance: ordens abertas do usuário no ambiente selecionado, desenhadas como linhas de preço no gráfico
  const [openOrders, setOpenOrders] = useState<ChartOrder[]>([]);
  const [ordersErr, setOrdersErr] = useState('');
  useEffect(() => {
    setOpenOrders([]); setOrdersErr('');
    if (market !== 'binance' || !symbol || !envReady) return;
    let stop = false, id: ReturnType<typeof setInterval> | undefined;
    const load = async () => {
      const r = await j(`/api/trade/orders?env=${dataEnv}&symbol=${symbol}`).catch(() => null);
      if (stop || !r) return;
      if (r.status === 404) { clearInterval(id); return; } // sem chaves neste ambiente: não insiste
      const b = await r.json().catch(() => ({}));
      if (stop) return;
      if (!r.ok) { setOrdersErr(b.error ?? `erro ${r.status}`); return; }
      setOrdersErr(''); setOpenOrders(b.open ?? []);
    };
    load(); id = setInterval(load, 15_000);
    return () => { stop = true; clearInterval(id); };
  }, [market, symbol, dataEnv, envReady]);
  const shown: Quote | null = viaWs ? { price: stream.price!, changePct: stream.changePct } : quote;

  // Aba B3 num timeframe que o plano não permite (salva antes, ou depois de aprender o limite): volta para o primeiro liberado
  useEffect(() => {
    if (profile && blocked(profile.timeframe, profile)) { const ok = TIMEFRAMES.find((t) => !blocked(t, profile)); if (ok) update({ timeframe: ok }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planB3, freeB3, profile?.market, profile?.symbol, profile?.timeframe]);
  const toggleSignals = () => { const v = !signals; setSignals(v); try { localStorage.setItem('prophet_signals', v ? '1' : '0'); } catch {} };
  // Níveis de gatilho de cada indicador ligado ou sugerido: aparecem dentro do cartão do indicador
  const levelIds = useMemo(() => [...new Set([...(profile?.indicators ?? []), ...sugg.map((x) => x.id)])].filter((x) => x in INDICATORS) as IndicatorId[], [profile?.indicators, sugg]);
  const levels = useMemo(() => (candles.length && profile ? triggerLevels(candles, levelIds) : []), [candles, levelIds]);
  const cards = [
    ...sugg.map((x) => ({ id: x.id as IndicatorId, label: x.label, s: x as Suggestion | null })),
    ...(profile?.indicators ?? []).filter((id) => id in INDICATORS && !sugg.some((x) => x.id === id)).map((id) => ({ id: id as IndicatorId, label: INDICATORS[id as IndicatorId].label, s: null })),
  ];
  const levelOf = (id: string) => levels.find((l) => l.id === id);
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
              <MarketLogo market={profile.market} />
              <SymbolInput symbol={profile.symbol} market={profile.market} env={dataEnv} onSelect={(s) => update({ symbol: s })} />
              {TIMEFRAMES.map((t) => { const off = blocked(t, profile); return <button key={t} className={t === profile.timeframe ? 'on' : ''} disabled={off} title={off ? `Indisponível para ${profile.symbol} no seu plano da brapi (permitidos: ${planB3!.join(', ')})` : undefined} onClick={() => update({ timeframe: t })}>{t}</button>; })}
              <span className="grow" />
              {profile.market === 'binance' && <span className={`envtag ${binEnv}`} title={binEnv === 'production' ? 'Ordens usam dinheiro real (muda no painel Operar)' : 'Ambiente de teste: sem dinheiro real (muda no painel Operar)'}>{binEnv === 'production' ? 'Produção' : 'Homologação'}</span>}
              <button className={live ? 'on' : ''} onClick={toggleLive} title={profile.market === 'b3' ? 'Cotação em tempo quase real via yfinance' : 'Preço e candle ao vivo por websocket da Binance (cai para consulta a cada 5 s se desconectar)'}>Preço real</button>
              {live && shown && <span><b>{fmtPrice(profile.market, profile.symbol, shown.price)}</b>{shown.changePct != null && <span style={{ color: shown.changePct >= 0 ? '#26a69a' : '#ef5350' }}> {shown.changePct >= 0 ? '+' : ''}{shown.changePct.toFixed(2)}%</span>}{viaWs && <span className="muted" title="Websocket da Binance conectado"> ●</span>}</span>}
              {profile.market === 'b3' && <HistoryBadge key={profile.symbol} symbol={profile.symbol} onReload={() => setReload((n) => n + 1)} />}
              {ordersErr && <span className="muted" style={{ color: '#f85149' }} title={ordersErr}>ordens indisponíveis: {ordersErr.slice(0, 70)}</span>}
              {live && !viaWs && quoteErr && <span className="muted" title={quoteErr}>cotação indisponível</span>}
              <button onClick={async () => { await j(`/api/profiles?id=${profile.id}`, 'DELETE'); const rest = profiles.filter((p) => p.id !== profile.id); setProfiles(rest); setActiveId(rest[0]?.id ?? null); }}>Excluir aba</button>
            </div>
            <div className="bar">
              <span className="muted">Indicadores:</span>
              <button className={signals ? 'on' : ''} onClick={toggleSignals} title="Setas de compra/venda no gráfico para os indicadores ligados">Sinais no gráfico</button>
              <button className={showNews ? 'on' : ''} title="Marca no gráfico os candles com notícia do papel (lista no painel Notícias)" onClick={() => { const v = !showNews; setShowNews(v); try { localStorage.setItem('prophet_news', v ? '1' : '0'); } catch {} }}>Notícias no gráfico</button>
              <span className="muted">|</span>
              {INDICATOR_IDS.map((id) => (
                <span className="indgrp" key={id}>
                  <button className={profile.indicators.includes(id) ? 'on' : ''} onClick={() => toggle(id)}>{INDICATORS[id].label}</button>
                  <button className={`help bell${notifier.on.includes(id) ? ' on' : ''}`} aria-pressed={notifier.on.includes(id)} aria-label={`Avisar sinais de ${INDICATORS[id].label}`} title={notifier.on.includes(id) ? 'Avisando sinais deste indicador (clique para desligar)' : 'Avisar no navegador, com som, quando este indicador der sinal'} onClick={() => notifier.toggle(id)}>{notifier.on.includes(id) ? '🔔' : '🔕'}</button>
                  <button className="help" aria-label={`Como funciona: ${INDICATORS[id].label}`} title="Como funciona" onClick={() => setHelpId(id)}>?</button>
                </span>))}
              {notifier.note && <span className="muted">{notifier.note}</span>}
              {notifier.on.length > 0 && <span className="muted">{notifier.telegram ? 'Sinos ligados: avisa também pelo Telegram, mesmo com o app fechado (todas as suas abas).' : 'Sinos ligados: cadastre seu chat no painel Telegram para receber também lá.'}</span>}
            </div>
            <div className="workspace">
              <div className="panel chartcol">
                {err ? <span style={{ color: '#f85149' }}>{err}</span> : <Chart viewKey={candlesKey} market={profile.market} candles={candles} indicators={profile.indicators} livePrice={live ? shown?.price : null} liveCandle={live && viaWs ? stream.candle : null} showSignals={signals} trades={trades} orders={openOrders} news={newsMarks} />}
              </div>
              <aside className="panel suggest">
                <div className="sughead"><b>Indicadores sugeridos</b><button className="help" aria-label="Como ler os indicadores sugeridos" title="Como ler os indicadores sugeridos" onClick={() => setRankHelp(true)}>?</button></div>
                <p className="muted">{profile.symbol} · {profile.timeframe}. Ordenados pelo que cada indicador teria rendido neste papel no passado. Em cada cartão, o preço de fechamento que faria o indicador dar sinal hoje. Para escolher um, comece pelo “Ret. líq.” e confira quantos sinais há (veja o ?). Não é recomendação.</p>
                {updatedAt && <p className="muted" title="Recalculado quando um candle novo aparece">Calculado às {updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>}
                {cards.map(({ id, label, s }) => {
                  const l = levelOf(id), last = candles.at(-1)?.close ?? 0;
                  return (
                    <div className="sugcard" key={id}>
                      <div className="sughead">
                        <b>{label}</b>
                        <button className="help" aria-label={`Como funciona: ${label}`} title="Como funciona" onClick={() => setHelpId(id)}>?</button>
                        <span className="grow" />
                        <button disabled={profile.indicators.includes(id)} onClick={() => toggle(id)}>{profile.indicators.includes(id) ? 'Em uso' : 'Aplicar'}</button>
                      </div>
                      {s ? (
                        <>
                          <div className="sugrow"><span>Sinais: <b>{s.signals}</b></span><span>Acerto: <b>{(s.hitRate * 100).toFixed(0)}%</b></span></div>
                          <div className="sugrow"><span>Ret. líq.: <b style={{ color: s.avgReturnPct >= 0 ? '#26a69a' : '#ef5350' }}>{s.avgReturnPct.toFixed(2)}%</b></span></div>
                          {s.hitFirst != null && s.hitSecond != null && (
                            <>
                              <div className="sugrow"><span>1ª metade <b>{(s.hitFirst * 100).toFixed(0)}%</b></span><span>2ª metade <b>{(s.hitSecond * 100).toFixed(0)}%</b></span></div>
                              {!s.stable && <div className="sugwarn">Resultado instável entre as duas metades</div>}
                            </>
                          )}
                        </>
                      ) : <div className="muted">Sem dados suficientes de sinais.</div>}
                      {l && (
                        <div className="suglevels">
                          {l.active !== 0 && <div style={{ color: l.active > 0 ? '#26a69a' : '#ef5350' }}>Sinal de {l.active > 0 ? 'compra' : 'venda'} agora</div>}
                          {l.buy != null && <div style={{ color: '#26a69a' }}>Compra se fechar {l.buy >= last ? 'acima de' : 'abaixo de'} {px(l.buy)}</div>}
                          {l.sell != null && <div style={{ color: '#ef5350' }}>Venda se fechar {l.sell >= last ? 'acima de' : 'abaixo de'} {px(l.sell)}</div>}
                          {l.buy == null && l.sell == null && l.active === 0 && <div className="muted">Sem gatilho a ±15% do preço atual</div>}
                        </div>
                      )}
                    </div>);
                })}
                {!cards.length && <span className="muted">Sem dados suficientes de sinais.</span>}
              </aside>
            </div>
          </>
        )}
      </div>
      {rankHelp && profile && <RankingHelpModal symbol={profile.symbol} timeframe={profile.timeframe} onClose={() => setRankHelp(false)} />}
      {helpId && <IndicatorHelpModal id={helpId} onClose={() => setHelpId(null)} />}
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
