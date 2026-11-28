'use client';
import { useEffect, useState } from 'react';
import { INDICATORS } from '@/lib/indicators';
import { parseNum } from '@/lib/risk';
import { TIMEFRAMES, type Timeframe } from '@/lib/types';
import type { Report } from '@/lib/validate';
import type { ToolCtx } from './registry';

const color = (n: number) => (n >= 0 ? '#26a69a' : '#ef5350');
const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1).replace('.', ',')}%`;
const Pct = ({ n }: { n: number }) => <span style={{ color: color(n) }}>{pct(n)}</span>;
const day = (t: number) => new Date(t * 1000).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', month: '2-digit', year: '2-digit', day: '2-digit' });

function Result({ r }: { r: Report }) {
  const won = r.windows.filter((w) => w.testPct > w.holdPct).length;
  const better = r.chosen.returnPct > r.hold.returnPct, safer = r.chosen.drawdownPct < r.hold.drawdownPct;
  const beating = r.rows.filter((x) => x.returnPct > r.hold.returnPct).length;
  const stat = (title: string, value: React.ReactNode) => <div className="stat"><span className="muted">{title}</span><b>{value}</b></div>;
  return (
    <>
      <section aria-label="Resultado do teste">
        <h4>Escolhendo o melhor do passado, de {day(r.from)} a {day(r.to)}</h4>
        <p className={better ? '' : 'warn'}>
          <b>{better ? 'Neste trecho, superou comprar e segurar' : 'Neste trecho, NÃO superou comprar e segurar'}</b>
          {' '}({pct(r.chosen.returnPct)} contra {pct(r.hold.returnPct)}), ganhando em {won} de {r.windows.length} janelas.
          {safer ? ' A maior queda foi menor que a de quem só segurou.' : ' E a maior queda não foi menor.'}
        </p>
        <div className="stats">
          {stat('Estratégia', <Pct n={r.chosen.returnPct} />)}
          {stat('Comprar e segurar', <Pct n={r.hold.returnPct} />)}
          {stat('Maior queda', `-${r.chosen.drawdownPct.toFixed(1).replace('.', ',')}%`)}
          {stat('Queda segurando', `-${r.hold.drawdownPct.toFixed(1).replace('.', ',')}%`)}
          {stat('Operações', r.chosen.trades)}
          {stat('Acerto', r.chosen.winRate == null ? '—' : `${(r.chosen.winRate * 100).toFixed(0)}%`)}
          {stat('Média por operação', r.chosen.avgTradePct == null ? '—' : <Pct n={r.chosen.avgTradePct} />)}
          {stat('Perdas seguidas', r.chosen.worstStreak)}
        </div>
        <table><thead><tr><th>Janela</th><th>Indicador escolhido</th><th>No período de escolha</th><th>Depois (real)</th><th>Segurar</th></tr></thead>
          <tbody>{r.windows.map((w) => (
            <tr key={w.from}>
              <td>{day(w.from)} a {day(w.to)}</td>
              <td>{w.chosen ? INDICATORS[w.chosen].label : <span className="muted">nenhum (ficou de fora)</span>}</td>
              <td>{w.trainPct == null ? '—' : <Pct n={w.trainPct} />}</td>
              <td><Pct n={w.testPct} /></td><td><Pct n={w.holdPct} /></td>
            </tr>))}</tbody>
        </table>
        <p className="muted">Compare as colunas “No período de escolha” e “Depois”: a diferença é o quanto o passado prometeu a mais do que entregou. O período de escolha tem {r.train} candles e cada janela, {r.test}.</p>
      </section>
      <section aria-label="Cada indicador sozinho">
        <h4>Cada indicador sozinho, no mesmo trecho</h4>
        <p className="muted">{beating} de {r.rows.length} superaram comprar e segurar. <b>Não escolha pelo topo desta tabela:</b> ela já mostra o resultado, e entre tantos algum se destaca por sorte.</p>
        <table><thead><tr><th>Indicador</th><th>Resultado</th><th>Maior queda</th><th>Op.</th><th>Acerto</th><th>Média/op.</th><th>Perdas seguidas</th><th>Janelas acima de segurar</th></tr></thead>
          <tbody>{r.rows.map((x) => (
            <tr key={x.id}>
              <td>{x.label}</td><td><Pct n={x.returnPct} /></td><td>-{x.drawdownPct.toFixed(1).replace('.', ',')}%</td><td>{x.trades}</td>
              <td>{x.winRate == null ? '—' : `${(x.winRate * 100).toFixed(0)}%`}</td><td>{x.avgTradePct == null ? '—' : <Pct n={x.avgTradePct} />}</td>
              <td>{x.worstStreak}</td><td>{x.beatWindows} de {r.windows.length}</td>
            </tr>))}</tbody>
        </table>
      </section>
    </>
  );
}

export default function ValidatePanel({ ctx }: { ctx: ToolCtx }) {
  const allowed = ctx.timeframes ?? TIMEFRAMES;
  const [chosen, setChosen] = useState<Timeframe>('1d');
  const timeframe = allowed.includes(chosen) ? chosen : allowed[0];
  const [stop, setStop] = useState('');
  const [gain, setGain] = useState('');
  const [slip, setSlip] = useState('0,05');
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // resultado de outro papel não pode ficar na tela
  useEffect(() => { setReport(null); setError(''); }, [ctx.market, ctx.symbol, ctx.env, timeframe]);

  const go = async () => {
    setBusy(true); setError(''); setReport(null);
    const q = new URLSearchParams({ market: ctx.market, symbol: ctx.symbol, tf: timeframe, env: ctx.env ?? 'production' });
    for (const [k, v] of [['stop', stop], ['gain', gain], ['slip', slip]]) if (v.trim()) q.set(k, String(parseNum(v)));
    const r = await fetch(`/api/validate?${q}`).catch(() => null);
    const body = await r?.json().catch(() => null);
    if (r?.ok) setReport(body); else setError(body?.error ?? 'não foi possível rodar o teste');
    setBusy(false);
  };

  return (
    <div className="stack">
      <p className="muted">Responde a uma pergunta: <b>se você tivesse escolhido o indicador olhando só o passado, teria dado certo depois?</b> A cada janela, o app escolhe o que mais rendeu no período anterior (com pelo menos 3 operações e resultado positivo) e mede no período seguinte, que a escolha não viu. Opera como o robô: compra e vende na abertura seguinte ao sinal.</p>
      <section>
        <h4>{ctx.symbol}</h4>
        <div className="robotform">
          <label className="field">Timeframe<select value={timeframe} onChange={(e) => setChosen(e.target.value as Timeframe)}>{TIMEFRAMES.map((t) => <option key={t} value={t} disabled={!allowed.includes(t)}>{t}{allowed.includes(t) ? '' : ' (indisponível)'}</option>)}</select></label>
          <label className="field">Stop loss % (opcional)<input inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} /></label>
          <label className="field">Stop gain % (opcional)<input inputMode="decimal" value={gain} onChange={(e) => setGain(e.target.value)} /></label>
          <label className="field">Derrapagem por ponta %<input inputMode="decimal" value={slip} onChange={(e) => setSlip(e.target.value)} /></label>
          <button className="on" disabled={busy} onClick={go}>{busy ? 'Calculando…' : 'Rodar teste'}</button>
        </div>
        <p className="muted">Se você testar vários stops até achar um bom, o resultado volta a ser ajustado ao passado.</p>
        {error && <p className="warn" role="alert">{error}</p>}
      </section>
      {report && <Result r={report} />}
      <p className="muted">Custo de 0,1% por operação mais a derrapagem. Não considera impostos, falta de liquidez nem dividendos (o que também reduz o resultado de quem segura). Cada janela começa fora do mercado e termina vendida. Um papel e um período não provam nada. Não é recomendação.</p>
    </div>
  );
}
