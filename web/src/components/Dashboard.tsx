'use client';
import { useCallback, useEffect, useState } from 'react';
import Chart from './Chart';
import { INDICATORS, INDICATOR_IDS } from '@/lib/indicators';
import { TIMEFRAMES, type Candle } from '@/lib/types';
import type { Suggestion } from '@/lib/suggest';

type Profile = { id: number; name: string; symbol: string; timeframe: string; indicators: string[] };
type Alert = { id: number; symbol: string; timeframe: string; kind: string; value: number };
const j = (url: string, method = 'GET', body?: unknown) =>
  fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

export default function Dashboard() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [sugg, setSugg] = useState<Suggestion[]>([]);
  const [err, setErr] = useState('');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [chatId, setChatId] = useState('');
  const [newAlert, setNewAlert] = useState({ kind: 'price_above', value: '' });
  const profile = profiles.find((p) => p.id === activeId);

  useEffect(() => { j('/api/profiles').then((r) => r.json()).then((ps: Profile[]) => { setProfiles(ps); setActiveId(ps[0]?.id ?? null); }); }, []);
  const loadAlerts = useCallback(() => j('/api/alerts').then((r) => r.json()).then((d) => { setAlerts(d.alerts); setChatId(d.telegramChatId ?? ''); }), []);
  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  const key = profile && `${profile.symbol}|${profile.timeframe}`;
  useEffect(() => {
    if (!profile) return;
    setErr(''); setSugg([]);
    const q = `symbol=${profile.symbol}&tf=${profile.timeframe}`;
    j(`/api/candles?${q}`).then(async (r) => (r.ok ? setCandles(await r.json()) : (setCandles([]), setErr((await r.json()).error))));
    j(`/api/suggest?${q}`).then(async (r) => r.ok && setSugg(await r.json()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = (patch: Partial<Profile>) => {
    if (!profile) return;
    const next = { ...profile, ...patch };
    setProfiles((ps) => ps.map((p) => (p.id === next.id ? next : p)));
    j('/api/profiles', 'PUT', next);
  };
  const toggle = (id: string) => update({ indicators: profile!.indicators.includes(id) ? profile!.indicators.filter((x) => x !== id) : [...profile!.indicators, id] });

  return (
    <>
      <div className="bar">
        <b>Prophet</b><span className="grow" />
        <button onClick={async () => { await j('/api/auth/logout', 'POST'); location.href = '/login'; }}>Sair</button>
      </div>
      <div className="tabs">
        {profiles.map((p) => <button key={p.id} className={p.id === activeId ? 'on' : ''} onClick={() => setActiveId(p.id)}>{p.name}</button>)}
        <button onClick={async () => { const p = await (await j('/api/profiles', 'POST', { name: `Aba ${profiles.length + 1}` })).json(); setProfiles([...profiles, p]); setActiveId(p.id); }}>+</button>
      </div>
      {profile && (
        <>
          <div className="bar">
            <input value={profile.name} onChange={(e) => update({ name: e.target.value })} style={{ width: 120 }} aria-label="Nome da aba" />
            <input defaultValue={profile.symbol} key={profile.id} style={{ width: 90 }} aria-label="Ativo" placeholder="PETR4"
              onKeyDown={(e) => e.key === 'Enter' && update({ symbol: (e.target as HTMLInputElement).value.toUpperCase() })}
              onBlur={(e) => e.target.value && update({ symbol: e.target.value.toUpperCase() })} />
            {TIMEFRAMES.map((t) => <button key={t} className={t === profile.timeframe ? 'on' : ''} onClick={() => update({ timeframe: t })}>{t}</button>)}
            <span className="grow" />
            <button onClick={async () => { await j(`/api/profiles?id=${profile.id}`, 'DELETE'); const rest = profiles.filter((p) => p.id !== profile.id); setProfiles(rest); setActiveId(rest[0]?.id ?? null); }}>Excluir aba</button>
          </div>
          <div className="bar">
            <span className="muted">Indicadores:</span>
            {INDICATOR_IDS.map((id) => <button key={id} className={profile.indicators.includes(id) ? 'on' : ''} onClick={() => toggle(id)}>{INDICATORS[id].label}</button>)}
          </div>
          <div className="panel">
            {err ? <span style={{ color: '#f85149' }}>{err}</span> : <Chart candles={candles} indicators={profile.indicators} />}
          </div>
          <div className="panel">
            <b>Indicadores sugeridos para {profile.symbol} ({profile.timeframe})</b>
            <p className="muted">Ranking histórico: para cada indicador, mede o retorno 5 candles após cada sinal neste ativo/timeframe. Descreve o passado, não prevê o futuro nem é recomendação.</p>
            <table><thead><tr><th>Indicador</th><th>Sinais</th><th>Acerto</th><th>Retorno médio</th><th /></tr></thead>
              <tbody>{sugg.map((s) => (
                <tr key={s.id}><td>{s.label}</td><td>{s.signals}</td><td>{(s.hitRate * 100).toFixed(0)}%</td><td>{s.avgReturnPct.toFixed(2)}%</td>
                  <td><button disabled={profile.indicators.includes(s.id)} onClick={() => toggle(s.id)}>Aplicar</button></td></tr>))}</tbody></table>
            {!sugg.length && <span className="muted">Sem dados suficientes de sinais.</span>}
          </div>
        </>
      )}
      <div className="panel">
        <b>Alertas no Telegram</b>
        <div className="bar" style={{ padding: '8px 0' }}>
          <input placeholder="seu chat_id do Telegram" value={chatId} onChange={(e) => setChatId(e.target.value)} />
          <button onClick={() => j('/api/alerts', 'PUT', { telegramChatId: chatId })}>Salvar</button>
          <span className="muted">Fale com o bot e use @userinfobot para descobrir seu chat_id.</span>
        </div>
        <div className="bar" style={{ padding: '8px 0' }}>
          <select value={newAlert.kind} onChange={(e) => setNewAlert({ ...newAlert, kind: e.target.value })}>
            <option value="price_above">preço acima de</option><option value="price_below">preço abaixo de</option>
            <option value="rsi_above">RSI acima de</option><option value="rsi_below">RSI abaixo de</option>
          </select>
          <input type="number" step="any" placeholder="valor" value={newAlert.value} onChange={(e) => setNewAlert({ ...newAlert, value: e.target.value })} style={{ width: 90 }} />
          <button disabled={!profile || !newAlert.value} onClick={async () => { await j('/api/alerts', 'POST', { ...newAlert, symbol: profile!.symbol, timeframe: profile!.timeframe }); setNewAlert({ ...newAlert, value: '' }); loadAlerts(); }}>
            Criar para {profile?.symbol}
          </button>
        </div>
        <table><tbody>{alerts.map((a) => (
          <tr key={a.id}><td>{a.symbol} {a.timeframe}</td><td>{a.kind.replace('_', ' ')} {a.value}</td>
            <td><button onClick={async () => { await j(`/api/alerts?id=${a.id}`, 'DELETE'); loadAlerts(); }}>remover</button></td></tr>))}</tbody></table>
      </div>
    </>
  );
}
