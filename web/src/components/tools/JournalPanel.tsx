'use client';
import { useCallback, useEffect, useState } from 'react';
import { INDICATORS, type IndicatorId } from '@/lib/indicators';
import { resultOf, WAIT_CANDLES, type Entry } from '@/lib/journal';
import { fmtPrice, splitPair } from '@/lib/markets';
import { parseNum } from '@/lib/risk';
import type { ToolCtx } from './registry';

const STATUS = { waiting: 'Aguardando compra', open: 'Em andamento', closed: 'Encerrada', expired: 'Expirou', cancelled: 'Cancelada' };
const currencyOf = (e: Entry) => (e.market === 'b3' ? 'R$' : splitPair(e.symbol).quote);
const money = (n: number, cur: string) => `${n > 0 ? '+' : ''}${cur === 'R$' ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : `${n.toLocaleString('pt-BR', { maximumFractionDigits: cur === 'BTC' ? 8 : 2 })} ${cur}`}`;
const color = (n: number) => (n >= 0 ? '#26a69a' : '#ef5350');
const day = (t: number) => new Date(t * 1000).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' });

export default function JournalPanel({ ctx }: { ctx: ToolCtx }) {
  const [list, setList] = useState<Entry[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'test' | 'real'>('all');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/journal').catch(() => null);
    if (r?.ok) setList(await r.json());
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);

  const send = async (url: string, method: string, body?: unknown) => {
    setError('');
    const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    if (!r?.ok) { setError((await r?.json().catch(() => null))?.error ?? 'não foi possível salvar'); return false; }
    await load();
    return true;
  };

  // resumo só do que terminou, separado por tipo e moeda
  const totals = new Map<string, { label: string; cur: string; n: number; wins: number; sum: number }>();
  for (const e of list ?? []) {
    const r = e.status === 'closed' ? resultOf(e) : null;
    if (!r) continue;
    const cur = currencyOf(e), label = e.kind === 'test' ? 'Teste' : 'Real', k = `${label}|${cur}`;
    const t = totals.get(k) ?? totals.set(k, { label, cur, n: 0, wins: 0, sum: 0 }).get(k)!;
    t.n++; t.sum += r.money; if (r.money > 0) t.wins++;
  }
  const shown = (list ?? []).filter((e) => filter === 'all' || e.kind === filter);

  return (
    <div className="stack">
      <section>
        <h4>Resumo das encerradas</h4>
        {!totals.size ? <span className="muted">Nada encerrado ainda.</span> : (
          <table><thead><tr><th>Tipo</th><th>Operações</th><th>Acerto</th><th>Resultado</th></tr></thead>
            <tbody>{[...totals.values()].map((t) => (
              <tr key={`${t.label}${t.cur}`}><td>{t.label}</td><td>{t.n}</td><td>{((t.wins / t.n) * 100).toFixed(0)}%</td><td style={{ color: color(t.sum) }}>{money(t.sum, t.cur)}</td></tr>))}</tbody>
          </table>)}
      </section>
      <RealForm ctx={ctx} onSave={(body) => send('/api/journal', 'POST', body)} />
      {error && <p className="warn" role="alert">{error}</p>}
      <section>
        <h4>Registros</h4>
        <div className="row">{(['all', 'test', 'real'] as const).map((f) => <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{{ all: 'Todos', test: 'Teste', real: 'Real' }[f]}</button>)}</div>
        {list == null ? <span className="muted">Carregando…</span> : !shown.length && <span className="muted">Nenhum registro. Para um teste de mesa, use “Acompanhar” num cartão de indicador ou na calculadora de risco.</span>}
        {shown.map((e) => <Item key={e.id} e={e} onClose={(exitPrice) => send('/api/journal', 'PATCH', { id: e.id, exitPrice })} onDelete={() => { if (confirm(`Excluir o registro de ${e.symbol}?`)) send(`/api/journal?id=${e.id}`, 'DELETE'); }} />)}
      </section>
      <p className="muted">O teste de mesa avança com os candles do app, mesmo com a tela fechada. Ele supõe execução no preço exato, o que na prática nem sempre acontece. Desdobramentos durante uma operação não são ajustados.</p>
    </div>
  );
}

function Item({ e, onClose, onDelete }: { e: Entry; onClose: (price: number) => void; onDelete: () => void }) {
  const [exit, setExit] = useState('');
  const r = resultOf(e), cur = currencyOf(e), px = (n: number) => fmtPrice(e.market, e.symbol, n);
  return (
    <div className="jcard">
      <div className="sughead">
        <b>{e.symbol}</b>{e.timeframe && <span className="muted">&nbsp;· {e.timeframe}</span>}
        <span className={`jtag ${e.kind}`}>{e.kind === 'test' ? 'Teste' : 'Real'}</span>{e.env === 'testnet' && <span className="jtag">Homologação</span>}
        <span className="grow" />
        <button className="help" aria-label={`Excluir registro de ${e.symbol}`} title="Excluir" onClick={onDelete}>×</button>
      </div>
      {e.indicator && <div className="muted">{INDICATORS[e.indicator as IndicatorId]?.label ?? e.indicator} · sai {e.exitRule === 'bars' ? 'após 5 candles' : 'no sinal de venda'}</div>}
      <div><b>{STATUS[e.status]}</b>{e.reason && <span className="muted"> · {e.reason}</span>}</div>
      {e.status === 'waiting' && <div className="muted">{e.signalTime ? 'Deu compra; entra na abertura do próximo candle.' : `Criado em ${day(e.createdAt)}. Expira após ${WAIT_CANDLES} candles sem compra.`}</div>}
      {e.entryPrice != null && <div>Entrada {day(e.entryTime!)}: {px(e.entryPrice)} × {e.qty!.toLocaleString('pt-BR', { maximumFractionDigits: 8 })}</div>}
      {e.exitPrice != null && <div>Saída {day(e.exitTime!)}: {px(e.exitPrice)}</div>}
      {(e.stopLoss != null || e.stopGain != null) && <div className="muted">Stop loss {e.stopLoss != null ? px(e.stopLoss) : '—'} · Stop gain {e.stopGain != null ? px(e.stopGain) : '—'}</div>}
      {r && <div>{e.status === 'open' ? 'Parcial' : 'Resultado'}: <b style={{ color: color(r.money) }}>{money(r.money, cur)} ({r.pct > 0 ? '+' : ''}{r.pct.toFixed(2).replace('.', ',')}%)</b></div>}
      {e.note && <div className="muted">“{e.note}”</div>}
      {e.kind === 'real' && e.status === 'open' && (
        <div className="row">
          <input inputMode="decimal" aria-label={`Preço de saída de ${e.symbol}`} placeholder="preço de saída" value={exit} onChange={(ev) => setExit(ev.target.value)} />
          <button disabled={!(parseNum(exit) > 0)} onClick={() => onClose(parseNum(exit))}>Encerrar</button>
        </div>)}
    </div>
  );
}

function RealForm({ ctx, onSave }: { ctx: ToolCtx; onSave: (body: unknown) => Promise<boolean> }) {
  const empty = { qty: '', entry: '', date: '', stop: '', gain: '', note: '' };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(empty);
  const field = (k: keyof typeof empty, label: string, type = 'text') => (
    <label className="field">{label}<input type={type} inputMode={type === 'text' && k !== 'note' ? 'decimal' : undefined} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>);
  if (!open) return <button onClick={() => { setF(empty); setOpen(true); }}>Registrar operação real de {ctx.symbol}</button>;
  const save = async () => {
    const ok = await onSave({
      kind: 'real', market: ctx.market, symbol: ctx.symbol, qty: parseNum(f.qty), entryPrice: parseNum(f.entry),
      entryTime: f.date ? Date.parse(`${f.date}T12:00:00-03:00`) / 1000 : undefined,
      stopLoss: f.stop.trim() ? parseNum(f.stop) : null, stopGain: f.gain.trim() ? parseNum(f.gain) : null, note: f.note,
    });
    if (ok) setOpen(false);
  };
  return (
    <section>
      <h4>Compra real de {ctx.symbol}</h4>
      <p className="muted">Anote o que você fez na corretora. Nada é enviado.</p>
      {field('qty', 'Quantidade')}
      {field('entry', 'Preço de compra')}
      {field('date', 'Data da compra (vazio = hoje)', 'date')}
      {field('stop', 'Stop loss (opcional)')}
      {field('gain', 'Stop gain (opcional)')}
      {field('note', 'Por que entrou')}
      <div className="row"><button className="on" disabled={!(parseNum(f.qty) > 0 && parseNum(f.entry) > 0)} onClick={save}>Salvar</button><button onClick={() => setOpen(false)}>Cancelar</button></div>
    </section>
  );
}
