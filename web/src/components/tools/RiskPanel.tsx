'use client';
import { useEffect, useState } from 'react';
import { parseNum, planPosition } from '@/lib/risk';
import { atr, INDICATORS, INDICATOR_IDS, type IndicatorId } from '@/lib/indicators';
import type { ExitRule } from '@/lib/journal';
import { COST } from '@/lib/suggest';
import { fmtPrice, pricePrecision, splitPair } from '@/lib/markets';
import type { ToolCtx } from './registry';

export default function RiskPanel({ ctx }: { ctx: ToolCtx }) {
  // trocar de papel ou timeframe descarta entrada, stop e alvo digitados
  return <Calc key={`${ctx.market}|${ctx.symbol}|${ctx.timeframe}`} ctx={ctx} />;
}

function Calc({ ctx }: { ctx: ToolCtx }) {
  const { market, symbol, candles } = ctx;
  const b3 = market === 'b3';
  const currency = b3 ? 'R$' : splitPair(symbol).quote;
  const [capital, setCapital] = useState('');
  const [risk, setRisk] = useState('1');
  const [entry, setEntry] = useState('');
  const [stop, setStop] = useState('');
  const [target, setTarget] = useState('');
  const [lot, setLot] = useState(1);
  const [indicator, setIndicator] = useState<IndicatorId>(() => (ctx.indicators.find((i) => i in INDICATORS) as IndicatorId) ?? INDICATOR_IDS[0]);
  const [exitRule, setExitRule] = useState<ExitRule>('signal');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<{ ok: boolean; text: string } | null>(null);

  // capital e risco ficam só neste navegador, separados por moeda
  const store = `prophet_risk_${currency}`;
  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(store) ?? '{}'); setCapital(s.capital ?? ''); setRisk(s.risk ?? '1'); if (s.lot) setLot(s.lot); } catch {}
  }, [store]);
  const save = (p: { capital?: string; risk?: string; lot?: number }) => {
    try { localStorage.setItem(store, JSON.stringify({ capital, risk, lot, ...p })); } catch {}
  };

  // “Acompanhar” num cartão: traz o indicador e o preço de gatilho
  const preset = ctx.preset?.symbol === symbol ? ctx.preset : null;
  useEffect(() => {
    if (!preset) return;
    setIndicator(preset.indicator); setSaved(null);
    setEntry(preset.entry != null ? preset.entry.toFixed(pricePrecision(market, preset.entry)).replace('.', ',') : '');
  }, [preset, market]);

  const last = candles.at(-1)?.close;
  const price = entry.trim() ? parseNum(entry) : last ?? NaN;
  const plan = planPosition({ capital: parseNum(capital), riskPct: parseNum(risk), entry: price, stop: parseNum(stop), target: parseNum(target) || null, step: b3 ? lot : 0.00001, cost: COST });
  const money = (n: number) => (b3 ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`);
  const asInput = (n: number) => n.toFixed(pricePrecision(market, n)).replace('.', ',');

  const low10 = candles.length >= 10 ? Math.min(...candles.slice(-10).map((c) => c.low)) : null;
  const range = candles.length >= 14 ? atr(candles).at(-1) ?? null : null;
  const stop2 = range != null && Number.isFinite(price) && price - 2 * range > 0 ? price - 2 * range : null;
  const risky = parseNum(risk) > 2;

  const follow = async () => {
    setSaved(null);
    const r = await fetch('/api/journal', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      kind: 'test', market, env: ctx.env, symbol, timeframe: ctx.timeframe, indicator, exitRule, note,
      capital: parseNum(capital), riskPct: parseNum(risk), stopLoss: parseNum(stop), stopGain: parseNum(target) || null, step: b3 ? lot : 0.00001,
    }) }).catch(() => null);
    if (r?.ok) { setSaved({ ok: true, text: 'Gravado. Veja o andamento no Diário.' }); setNote(''); }
    else setSaved({ ok: false, text: (await r?.json().catch(() => null))?.error ?? 'não foi possível gravar' });
  };

  return (
    <div className="stack">
      <section>
        <h4>Quanto comprar de {symbol}</h4>
        <p className="muted">Você decide quanto aceita perder se der errado; a calculadora diz a quantidade. Só para <b>compra</b>.</p>
        <label className="field">Capital para operar ({currency})
          <input inputMode="decimal" value={capital} placeholder="ex.: 10000" onChange={(e) => { setCapital(e.target.value); save({ capital: e.target.value }); }} />
        </label>
        <label className="field">Perda máxima nesta operação (% do capital)
          <input inputMode="decimal" value={risk} onChange={(e) => { setRisk(e.target.value); save({ risk: e.target.value }); }} />
        </label>
        {risky && <p className="warn">Acima de 2% por operação, poucas perdas seguidas já consomem boa parte do capital.</p>}
        <label className="field">Preço de entrada
          <input inputMode="decimal" value={entry} placeholder={last != null ? `último fechamento: ${asInput(last)}` : ''} onChange={(e) => setEntry(e.target.value)} />
        </label>
        <label className="field">Stop loss (preço em que você sai se cair)
          <input inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} />
        </label>
        <div className="row wrap">
          {low10 != null && low10 < price && <button onClick={() => setStop(asInput(low10))} title="Menor preço dos últimos 10 candles">Mínima de 10 candles: {asInput(low10)}</button>}
          {stop2 != null && <button onClick={() => setStop(asInput(stop2))} title="Entrada menos duas vezes a oscilação média (ATR 14)">2 × ATR: {asInput(stop2)}</button>}
        </div>
        <label className="field">Stop gain (opcional, preço em que você realiza o lucro)
          <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
        </label>
        {b3 && (
          <label className="field">Tipo de lote
            <select value={lot} onChange={(e) => { const v = Number(e.target.value); setLot(v); save({ lot: v }); }}>
              <option value={1}>Fracionário (de 1 em 1 ação)</option>
              <option value={100}>Lote padrão (de 100 em 100)</option>
            </select>
          </label>)}
      </section>
      <section aria-live="polite">
        <h4>Resultado</h4>
        {!plan ? <span className="muted">{parseNum(stop) >= price ? 'O stop loss precisa ficar abaixo do preço de entrada.' : 'Preencha capital, risco e stop loss.'}</span>
          : plan.qty === 0 ? <p className="warn">Com esse risco não dá para comprar nem {b3 ? (lot === 100 ? 'um lote de 100' : 'uma ação') : 'a quantidade mínima'}. Não entre, ou reveja o stop loss.</p>
          : (
            <>
              <table><tbody>
                <tr><td>Comprar</td><td><b>{plan.qty.toLocaleString('pt-BR', { maximumFractionDigits: 8 })} {b3 ? 'ações' : splitPair(symbol).base}</b></td></tr>
                <tr><td>Valor da compra</td><td>{money(plan.value)}</td></tr>
                <tr><td>Entrada → stop loss</td><td>{fmtPrice(market, symbol, price)} → {fmtPrice(market, symbol, parseNum(stop))} (-{plan.stopPct.toFixed(2).replace('.', ',')}%)</td></tr>
                <tr><td>Perda se bater o stop loss</td><td style={{ color: '#ef5350' }}><b>{money(plan.maxLoss)}</b> ({plan.lossPct.toFixed(2).replace('.', ',')}% do capital)</td></tr>
                {plan.gain != null && <tr><td>Ganho se bater o stop gain</td><td style={{ color: plan.gain > 0 ? '#26a69a' : '#ef5350' }}>{money(plan.gain)}</td></tr>}
                {plan.rewardRisk != null && <tr><td>Ganho ÷ risco</td><td>{plan.rewardRisk.toFixed(1).replace('.', ',')}</td></tr>}
              </tbody></table>
              {plan.limitedBy === 'capital' && <p className="muted">O stop loss está tão perto que a quantidade foi limitada pelo seu capital (sem alavancagem).</p>}
              {plan.rewardRisk != null && plan.rewardRisk < 1 && <p className="warn">O stop gain paga menos do que você arrisca.</p>}
            </>)}
      </section>
      <section>
        <h4>Teste de mesa</h4>
        <p className="muted">O app espera o indicador dar compra em {symbol} ({ctx.timeframe}), “entra” na abertura seguinte e acompanha até sair, sem dinheiro. A quantidade é recalculada no preço real de entrada.</p>
        <label className="field">Indicador que dá a entrada
          <select value={indicator} onChange={(e) => { setIndicator(e.target.value as IndicatorId); setSaved(null); }}>{INDICATOR_IDS.map((id) => <option key={id} value={id}>{INDICATORS[id].label}</option>)}</select>
        </label>
        <label className="field">Além dos stops, sair
          <select value={exitRule} onChange={(e) => setExitRule(e.target.value as ExitRule)}>
            <option value="signal">no sinal de venda do indicador</option>
            <option value="bars">após 5 candles (como nos cartões)</option>
          </select>
        </label>
        <label className="field">Anotação (opcional)<input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></label>
        <button className="on" disabled={!plan} onClick={follow}>Acompanhar</button>
        {!plan && <span className="muted"> preencha capital, risco e stop loss</span>}
        {saved && <p className={saved.ok ? 'muted' : 'warn'} role="status">{saved.text}</p>}
      </section>
      <p className="muted">A perda inclui {(COST * 100).toFixed(1).replace('.', ',')}% de custo. <b>Ela pode ser maior:</b> se o preço abrir abaixo do stop loss, a saída é no preço que houver. Impostos não entram. {b3 ? 'No fracionário, o código na corretora termina em F.' : 'A Binance pode arredondar a quantidade conforme as regras do par.'} Nada é enviado à corretora.</p>
    </div>
  );
}
