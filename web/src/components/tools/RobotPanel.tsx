'use client';
import { useCallback, useEffect, useState } from 'react';
import { INDICATORS, INDICATOR_IDS, type IndicatorId } from '@/lib/indicators';
import { equity, holdValue, type Robot } from '@/lib/robot';
import { parseNum } from '@/lib/risk';
import { fmtPrice, splitPair } from '@/lib/markets';
import { TIMEFRAMES, type Timeframe } from '@/lib/types';
import type { ToolCtx } from './registry';

const color = (n: number) => (n >= 0 ? '#26a69a' : '#ef5350');
const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2).replace('.', ',')}%`;
const currencyOf = (r: Robot) => (r.market === 'b3' ? 'R$' : splitPair(r.symbol).quote);
const money = (n: number, cur: string) => (cur === 'R$' ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : `${n.toLocaleString('pt-BR', { maximumFractionDigits: cur === 'BTC' ? 8 : 2 })} ${cur}`);
const when = (t: number, tf: string) => new Date(t * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', ...(['1d', '1wk', '1mo'].includes(tf) ? {} : { hour: '2-digit', minute: '2-digit' }) });
const label = (r: Robot) => INDICATORS[r.indicator]?.label ?? r.indicator;
const gainOf = (r: Robot) => (equity(r.state) / r.capital - 1) * 100;
const holdOf = (r: Robot) => (holdValue(r.state, r.capital) / r.capital - 1) * 100;

function Curve({ points }: { points: [number, number, number][] }) {
  if (points.length < 2) return <p className="muted">O gráfico aparece depois de dois candles fechados.</p>;
  const W = 700, H = 130, all = points.flatMap((p) => [p[1], p[2]]), lo = Math.min(...all), hi = Math.max(...all);
  const path = (k: 1 | 2) => points.map((p, i) => `${i ? 'L' : 'M'}${((i / (points.length - 1)) * W).toFixed(1)},${(H - 4 - ((p[k] - lo) / (hi - lo || 1)) * (H - 8)).toFixed(1)}`).join('');
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Patrimônio do robô comparado com comprar e segurar">
        <path d={path(2)} fill="none" stroke="#6e7681" strokeWidth="1.4" />
        <path d={path(1)} fill="none" stroke="#2f81f7" strokeWidth="2" />
      </svg>
      <div className="muted"><span style={{ color: '#2f81f7' }}>■</span> robô · <span>■</span> comprar e segurar</div>
    </>
  );
}

function Detail({ r }: { r: Robot }) {
  const s = r.state, cur = currencyOf(r), px = (n: number) => fmtPrice(r.market, r.symbol, n);
  const wins = s.trades.filter((t) => t.money > 0).length;
  const stat = (title: string, value: React.ReactNode) => <div className="stat"><span className="muted">{title}</span><b>{value}</b></div>;
  return (
    <section aria-label={`Detalhes de ${r.symbol}`}>
      <h4>{r.symbol} · {r.timeframe} · {label(r)}</h4>
      <p className="muted">Começou em {when(r.createdAt, '1m')} com {money(r.capital, cur)}. Stop loss {r.stopPct ? `${r.stopPct}%` : '—'} · Stop gain {r.gainPct ? `${r.gainPct}%` : '—'}{r.stoppedAt ? ` · parado em ${when(r.stoppedAt, '1m')}` : ''}</p>
      <div className="stats">
        {stat('Patrimônio', money(equity(s), cur))}
        {stat('Robô', <span style={{ color: color(gainOf(r)) }}>{pct(gainOf(r))}</span>)}
        {stat('Comprar e segurar', <span style={{ color: color(holdOf(r)) }}>{pct(holdOf(r))}</span>)}
        {stat('Maior queda', `-${s.maxDrawdownPct.toFixed(2).replace('.', ',')}%`)}
        {stat('Operações', s.trades.length)}
        {stat('Acerto', s.trades.length ? `${((wins / s.trades.length) * 100).toFixed(0)}%` : '—')}
      </div>
      <p>
        {s.position ? <>Comprado desde {when(s.position.entryTime, r.timeframe)}: {s.position.qty.toLocaleString('pt-BR', { maximumFractionDigits: 8 })} a {px(s.position.entryPrice)}{s.lastPrice != null && <> · agora <span style={{ color: color(s.lastPrice - s.position.entryPrice) }}>{pct((s.lastPrice / s.position.entryPrice - 1) * 100)}</span></>}.</>
          : r.status === 'running' ? 'Fora do mercado, esperando um sinal de compra.' : 'Encerrado, sem posição.'}
        {s.pending && <b> Sinal de {s.pending === 'buy' ? 'compra' : 'venda'}: executa na abertura do próximo candle.</b>}
      </p>
      <Curve points={s.curve} />
      {!!s.trades.length && (
        <table><thead><tr><th>Entrada</th><th>Preço</th><th>Saída</th><th>Preço</th><th>Qtde</th><th>Resultado</th><th>Motivo</th></tr></thead>
          <tbody>{[...s.trades].reverse().map((t) => (
            <tr key={`${t.entryTime}-${t.exitTime}`}>
              <td>{when(t.entryTime, r.timeframe)}</td><td>{px(t.entryPrice)}</td><td>{when(t.exitTime, r.timeframe)}</td><td>{px(t.exitPrice)}</td>
              <td>{t.qty.toLocaleString('pt-BR', { maximumFractionDigits: 8 })}</td>
              <td style={{ color: color(t.money) }}>{money(t.money, cur)} ({pct(t.pct)})</td><td className="muted">{t.reason}</td>
            </tr>))}</tbody>
        </table>)}
    </section>
  );
}

export default function RobotPanel({ ctx }: { ctx: ToolCtx }) {
  const [list, setList] = useState<Robot[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [indicator, setIndicator] = useState<IndicatorId>(() => (ctx.indicators.find((i) => i in INDICATORS) as IndicatorId) ?? INDICATOR_IDS[0]);
  const [capital, setCapital] = useState('10000');
  const allowed = ctx.timeframes ?? TIMEFRAMES;
  const [chosen, setChosen] = useState(ctx.timeframe as Timeframe);
  const timeframe = allowed.includes(chosen) ? chosen : allowed[0]; // trocar de papel pode tirar o escolhido
  const [stop, setStop] = useState('');
  const [gain, setGain] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/robots').catch(() => null);
    if (r?.ok) setList(await r.json());
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 15_000); return () => clearInterval(t); }, [load]);

  const send = async (url: string, method: string, body?: unknown) => {
    setError('');
    const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    if (!r?.ok) setError((await r?.json().catch(() => null))?.error ?? 'não foi possível salvar');
    await load();
    return !!r?.ok;
  };
  const create = () => send('/api/robots', 'POST', {
    market: ctx.market, env: ctx.env, symbol: ctx.symbol, timeframe, indicator,
    capital: parseNum(capital), stopPct: stop.trim() ? parseNum(stop) : null, gainPct: gain.trim() ? parseNum(gain) : null,
  });
  const current = list?.find((r) => r.id === selected) ?? list?.[0];

  return (
    <div className="stack">
      <p className="muted">O robô compra e vende sozinho, <b>de mentira</b>, quando o indicador dá sinal: sempre na abertura do candle seguinte e com todo o saldo. <b>Nenhuma ordem é enviada.</b> Ele roda mesmo com o app fechado e avisa pelo Telegram, se o seu chat estiver cadastrado.</p>
      <section>
        <h4>Novo robô para {ctx.symbol}</h4>
        <div className="robotform">
          <label className="field">Timeframe<select value={timeframe} onChange={(e) => setChosen(e.target.value as Timeframe)}>{TIMEFRAMES.map((t) => <option key={t} value={t} disabled={!allowed.includes(t)}>{t}{allowed.includes(t) ? '' : ' (indisponível)'}</option>)}</select></label>
          <label className="field">Indicador<select value={indicator} onChange={(e) => setIndicator(e.target.value as IndicatorId)}>{INDICATOR_IDS.map((id) => <option key={id} value={id}>{INDICATORS[id].label}</option>)}</select></label>
          <label className="field">Valor simulado ({ctx.market === 'b3' ? 'R$' : splitPair(ctx.symbol).quote})<input inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} /></label>
          <label className="field">Stop loss % (opcional)<input inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} /></label>
          <label className="field">Stop gain % (opcional)<input inputMode="decimal" value={gain} onChange={(e) => setGain(e.target.value)} /></label>
          <button className="on" disabled={!(parseNum(capital) > 0)} onClick={create}>Ligar robô</button>
        </div>
        <p className="muted">Para outro papel, troque na tela principal. Só valem sinais de candles que fecharem a partir de agora.</p>
        {error && <p className="warn" role="alert">{error}</p>}
      </section>
      <section>
        <h4>Seus robôs</h4>
        {list == null ? <span className="muted">Carregando…</span> : !list.length ? <span className="muted">Nenhum robô ainda.</span> : (
          <table className="robots"><thead><tr><th>Papel</th><th>Indicador</th><th>Situação</th><th>Robô</th><th>Segurar</th><th>Op.</th><th /></tr></thead>
            <tbody>{list.map((r) => (
              <tr key={r.id} className={r.id === current?.id ? 'sel' : ''}>
                <td><button className="link" onClick={() => setSelected(r.id)}>{r.symbol} · {r.timeframe}</button>{r.env === 'testnet' && <span className="jtag">Homologação</span>}</td>
                <td>{label(r)}</td>
                <td>{r.status === 'stopped' ? 'Parado' : r.state.position ? 'Comprado' : 'Esperando'}</td>
                <td style={{ color: color(gainOf(r)) }}>{pct(gainOf(r))}</td>
                <td style={{ color: color(holdOf(r)) }}>{pct(holdOf(r))}</td>
                <td>{r.state.trades.length}</td>
                <td>
                  {r.status === 'running'
                    ? <button onClick={() => { if (confirm(`Parar o robô de ${r.symbol}? A posição simulada é encerrada e ele não volta a rodar.`)) send('/api/robots', 'PATCH', { id: r.id }); }}>Parar</button>
                    : <button onClick={() => { if (confirm(`Excluir o robô de ${r.symbol} e o histórico dele?`)) send(`/api/robots?id=${r.id}`, 'DELETE'); }}>Excluir</button>}
                </td>
              </tr>))}</tbody>
          </table>)}
      </section>
      {current && <Detail r={current} />}
      <p className="muted">Desconta 0,1% de custo por operação; não considera impostos, falta de liquidez nem desdobramentos durante a posição. Poucas operações não provam nada, e entre muitos robôs algum se destaca por sorte.</p>
    </div>
  );
}
