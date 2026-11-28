'use client';
import { useEffect, useMemo, useState } from 'react';
import { INDICATORS, INDICATOR_IDS, type IndicatorId } from '@/lib/indicators';
import { backtest, DEFAULT_OPTS, type BacktestOpts } from '@/lib/backtest';
import type { ToolCtx } from './registry';

const pct = (n: number | null, d = 1) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`);
const col = (n: number | null) => (n == null ? undefined : n >= 0 ? '#26a69a' : '#ef5350');

function Spark({ a, b }: { a: number[]; b: number[] }) {
  const W = 300, H = 70, all = [...a, ...b], lo = Math.min(...all), hi = Math.max(...all);
  const path = (v: number[]) => v.map((y, i) => `${i ? 'L' : 'M'}${((i / Math.max(1, v.length - 1)) * W).toFixed(1)},${(H - ((y - lo) / (hi - lo || 1)) * H).toFixed(1)}`).join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Capital da estratégia versus comprar e segurar">
      <path d={path(b)} fill="none" stroke="#6e7681" strokeWidth="1.2" />
      <path d={path(a)} fill="none" stroke="#2f81f7" strokeWidth="1.6" />
    </svg>
  );
}

export default function SimulationPanel({ ctx }: { ctx: ToolCtx }) {
  const [o, setO] = useState<BacktestOpts>(() => ({ ...DEFAULT_OPTS, ids: (ctx.indicators.filter((i) => i in INDICATORS) as IndicatorId[]).slice(0, 3) }));
  const set = (p: Partial<BacktestOpts>) => setO((x) => ({ ...x, ...p }));
  const toggle = (id: IndicatorId) => set({ ids: o.ids.includes(id) ? o.ids.filter((x) => x !== id) : [...o.ids, id] });
  const num = (v: string) => (v === '' || !Number.isFinite(Number(v)) || Number(v) <= 0 ? null : Number(v));

  const r = useMemo(() => (ctx.candles.length > 2 && o.ids.length ? backtest(ctx.candles, o) : null), [ctx.candles, o]);
  const { onTrades } = ctx;
  useEffect(() => { onTrades?.(r ? r.trades : null); return () => onTrades?.(null); }, [r, onTrades]);

  const daily = ['1d', '1wk', '1mo'].includes(ctx.timeframe);
  const fmt = (t: number) => new Date(t * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', ...(daily ? {} : { hour: '2-digit', minute: '2-digit' }) });

  return (
    <div className="stack">
      <section>
        <h4>Simulação de {ctx.symbol} ({ctx.timeframe})</h4>
        <p className="muted">Entra na <b>abertura do candle seguinte</b> ao sinal de compra do indicador e sai conforme a regra abaixo. Só compra (long). Para swing, use o timeframe 1d.</p>
        <div className="muted">Indicadores</div>
        <div className="chips">{INDICATOR_IDS.map((id) => <button key={id} className={o.ids.includes(id) ? 'on' : ''} onClick={() => toggle(id)}>{INDICATORS[id].label}</button>)}</div>
        {o.ids.length > 1 && (
          <div className="row" style={{ marginTop: 8 }}>
            <select value={o.mode} onChange={(e) => set({ mode: e.target.value as 'any' | 'all' })}>
              <option value="any">entra se QUALQUER der compra</option>
              <option value="all">entra só se TODOS derem compra</option>
            </select>
            {o.mode === 'all' && <><input type="number" min={1} value={o.window} onChange={(e) => set({ window: Math.max(1, Number(e.target.value) || 1) })} style={{ width: 56 }} title="janela em candles" /><span className="muted">candles</span></>}
          </div>)}
      </section>
      <section>
        <h4>Saída e risco</h4>
        <div className="row">
          <select value={o.exit} onChange={(e) => set({ exit: e.target.value as 'opposite' | 'bars' })}>
            <option value="opposite">no sinal de venda</option><option value="bars">após N candles</option>
          </select>
          {o.exit === 'bars' && <input type="number" min={1} value={o.bars} onChange={(e) => set({ bars: Math.max(1, Number(e.target.value) || 1) })} style={{ width: 64 }} />}
        </div>
        <div className="row wrap">
          <label className="muted">Stop loss % <input type="number" min={0} step="any" value={o.stopPct ?? ''} placeholder="—" onChange={(e) => set({ stopPct: num(e.target.value) })} style={{ width: 64 }} /></label>
          <label className="muted">Stop gain % <input type="number" min={0} step="any" value={o.targetPct ?? ''} placeholder="—" onChange={(e) => set({ targetPct: num(e.target.value) })} style={{ width: 64 }} /></label>
          <label className="muted">Custo % <input type="number" min={0} step="any" value={o.costPct} onChange={(e) => set({ costPct: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 64 }} /></label>
        </div>
      </section>
      {!o.ids.length && <span className="muted">Escolha ao menos um indicador.</span>}
      {r && (
        <>
          <section>
            <h4>Resultado</h4>
            <table><tbody>
              <tr><td>Operações</td><td>{r.n}</td></tr>
              <tr><td>Taxa de acerto</td><td>{r.winRate == null ? '—' : `${(r.winRate * 100).toFixed(0)}%`}</td></tr>
              <tr><td>Retorno médio / op.</td><td style={{ color: col(r.avgRetPct) }}>{pct(r.avgRetPct, 2)}</td></tr>
              <tr><td>Ganho médio · perda média</td><td><span style={{ color: '#26a69a' }}>{pct(r.avgWinPct, 2)}</span> · <span style={{ color: '#ef5350' }}>{pct(r.avgLossPct, 2)}</span></td></tr>
              <tr><td>Fator de lucro</td><td>{r.profitFactor == null ? '—' : r.profitFactor.toFixed(2)}</td></tr>
              <tr><td>Retorno da estratégia</td><td style={{ color: col(r.totalReturnPct) }}><b>{pct(r.totalReturnPct)}</b></td></tr>
              <tr><td>Comprar e segurar (mesmo período)</td><td style={{ color: col(r.buyHoldPct) }}>{pct(r.buyHoldPct)}</td></tr>
              <tr><td>Maior queda do capital</td><td>-{r.maxDrawdownPct.toFixed(1)}%</td></tr>
              <tr><td>Tempo médio · exposição</td><td>{r.avgBars == null ? '—' : `${r.avgBars.toFixed(1)} candles`} · {r.exposurePct.toFixed(0)}%</td></tr>
            </tbody></table>
            <div style={{ marginTop: 8 }}><Spark a={r.equity} b={r.buyHold} /></div>
            <div className="muted"><span style={{ color: '#2f81f7' }}>■</span> estratégia · <span>■</span> comprar e segurar</div>
          </section>
          <section>
            <h4>Se sustenta?</h4>
            <p className="muted">Mesmas regras em cada metade do histórico. Resultados muito diferentes sugerem sorte ou ajuste ao passado.</p>
            <table><tbody>
              <tr><td>1ª metade</td><td>{r.firstHalf.n} op.</td><td>{r.firstHalf.winRate == null ? '—' : `${(r.firstHalf.winRate * 100).toFixed(0)}%`}</td><td style={{ color: col(r.firstHalf.avgRetPct) }}>{pct(r.firstHalf.avgRetPct, 2)}</td></tr>
              <tr><td>2ª metade</td><td>{r.secondHalf.n} op.</td><td>{r.secondHalf.winRate == null ? '—' : `${(r.secondHalf.winRate * 100).toFixed(0)}%`}</td><td style={{ color: col(r.secondHalf.avgRetPct) }}>{pct(r.secondHalf.avgRetPct, 2)}</td></tr>
            </tbody></table>
            {r.n < 10 && <p style={{ color: '#d29922' }}>Só {r.n} operação(ões): amostra pequena demais para concluir qualquer coisa.</p>}
          </section>
          <section>
            <h4>Operações</h4>
            {!r.trades.length && <span className="muted">Nenhum sinal de compra no período.</span>}
            <table><thead><tr><th>Entrada</th><th>Saída</th><th>Result.</th><th>Motivo</th></tr></thead>
              <tbody>{[...r.trades].reverse().map((t) => (
                <tr key={t.entryIdx}><td>{fmt(t.entryTime)}</td><td>{fmt(t.exitTime)}</td><td style={{ color: col(t.retPct) }}>{pct(t.retPct, 2)}</td><td className="muted">{t.reason === 'stop' ? 'stop loss' : t.reason === 'alvo' ? 'stop gain' : t.reason}</td></tr>))}</tbody>
            </table>
          </section>
          <p className="muted">Simulação histórica: não inclui impostos, corretagem real nem execução parcial, e não garante resultado futuro. Não é recomendação de investimento.</p>
        </>
      )}
    </div>
  );
}
