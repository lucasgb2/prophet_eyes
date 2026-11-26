'use client';
import { useBinanceEnv } from '../useBinanceEnv';
import { useCallback, useEffect, useState } from 'react';
import { splitPair } from '@/lib/markets';
import type { ToolCtx } from './registry';

type Env = 'testnet' | 'production';
type Conn = { configured: boolean; apiKey?: string };
type Status = { testnet: Conn; production: Conn; productionAllowed: boolean; maxNotionalUsdt: number; cryptoReady: boolean };
type Rules = { symbol: string; base: string; quote: string; stepSize: string; minQty: string; tickSize: string; minNotional: string };
type Ord = { orderId: number; side: string; type: string; status: string; price: string; origQty: string; executedQty: string; time: number };

const j = (url: string, method = 'GET', body?: unknown) =>
  fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
const trim = (s: string) => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const when = (t: number) => new Date(t * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function TradePanel({ ctx }: { ctx: ToolCtx }) {
  const [env, setEnv] = useBinanceEnv();
  const [st, setSt] = useState<Status | null>(null);
  const [keys, setKeys] = useState({ apiKey: '', apiSecret: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [balances, setBalances] = useState<{ asset: string; free: string; locked: string; brl?: number | null }[] | null>(null);
  const [totalBrl, setTotalBrl] = useState<number | null>(null);
  const [rules, setRules] = useState<{ rules: Rules; price: number } | null>(null);
  const [o, setO] = useState({ side: 'BUY', type: 'MARKET', quantity: '', price: '' });
  const [review, setReview] = useState(false);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState<{ open: Ord[]; recent: Ord[] } | null>(null);

  const prod = env === 'production';
  const conn = st?.[env];
  const pair = splitPair(ctx.symbol);

  const pickEnv = (e: Env) => { setEnv(e); setReview(false); setAck(false); setMsg(null); };

  const loadStatus = useCallback(() => j('/api/trade/credentials').then((r) => r.json()).then(setSt), []);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  const loadAccount = useCallback(async () => {
    setBalances(null);
    if (!conn?.configured) return;
    const r = await j(`/api/trade/account?env=${env}`); const b = await r.json();
    if (r.ok) { setBalances(b.balances); setTotalBrl(b.totalBrl ?? null); } else setMsg({ ok: false, text: b.error });
  }, [env, conn?.configured]);
  const loadOrders = useCallback(async () => {
    setOrders(null);
    if (!conn?.configured) return;
    const r = await j(`/api/trade/orders?env=${env}&symbol=${ctx.symbol}`); const b = await r.json();
    if (r.ok) setOrders(b);
  }, [env, ctx.symbol, conn?.configured]);
  useEffect(() => { loadAccount(); loadOrders(); }, [loadAccount, loadOrders]);
  useEffect(() => { setRules(null); j(`/api/trade/rules?env=${env}&symbol=${ctx.symbol}`).then((r) => r.json()).then((b) => b.rules && setRules(b)); setReview(false); }, [ctx.symbol, env]);

  const price = o.type === 'LIMIT' && Number(o.price) > 0 ? Number(o.price) : rules?.price ?? ctx.candles.at(-1)?.close ?? 0;
  const notional = (Number(o.quantity.replace(',', '.')) || 0) * price;
  const body = (extra: object) => ({ env, symbol: ctx.symbol, side: o.side, type: o.type, quantity: o.quantity, price: o.type === 'LIMIT' ? o.price : undefined, ...extra });

  const submit = async (test: boolean) => {
    setBusy(true); setMsg(null);
    const r = await j('/api/trade/orders', 'POST', body(test ? { test: true } : { confirm: true })); const b = await r.json();
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: b.error }); return; }
    const p = b.prepared;
    setMsg({ ok: true, text: test
      ? `Ordem válida (não enviada): ${p.side === 'BUY' ? 'compra' : 'venda'} de ${p.quantity} ${pair.base}${p.price ? ` a ${p.price}` : ' a mercado'}.`
      : `Ordem enviada (#${b.result.orderId}, ${b.result.status}). Executado: ${b.result.executedQty} ${pair.base}.` });
    if (!test) { setReview(false); setAck(false); setO({ ...o, quantity: '' }); loadAccount(); loadOrders(); }
  };

  const saveKeys = async () => {
    setBusy(true); setMsg(null);
    const r = await j('/api/trade/credentials', 'PUT', { env, ...keys }); const b = await r.json();
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: b.error }); return; }
    setKeys({ apiKey: '', apiSecret: '' }); setMsg({ ok: true, text: 'Chaves validadas e guardadas (criptografadas).' }); loadStatus();
  };

  return (
    <div className="stack">
      <section>
        <h4>Ambiente</h4>
        <div className="row">
          <button className={!prod ? 'on' : ''} onClick={() => pickEnv('testnet')}>Homologação (testnet)</button>
          <button className={prod ? 'danger' : ''} onClick={() => pickEnv('production')}>Produção</button>
        </div>
        {prod
          ? <p className="warn">PRODUÇÃO: ordens com dinheiro real.{st && !st.productionAllowed && ' O envio está desabilitado neste servidor (BINANCE_ALLOW_PRODUCTION); só é possível ver saldo e validar ordens.'}</p>
          : <p className="muted">Homologação usa dinheiro de teste da Binance. Os gráficos continuam com os preços do mercado real, então o preço de execução na testnet pode diferir.</p>}
      </section>

      <section>
        <h4>Conexão</h4>
        {st && !st.cryptoReady && <p className="warn">O servidor não tem CREDENTIALS_KEY: não dá para guardar chaves. Veja o .env.example.</p>}
        {conn?.configured ? (
          <div className="row">
            <span className="grow">Chave <b>{conn.apiKey}</b> conectada</span>
            <button onClick={async () => { await j(`/api/trade/credentials?env=${env}`, 'DELETE'); setBalances(null); setOrders(null); loadStatus(); }}>Remover</button>
          </div>
        ) : (
          <>
            <p className="muted">{prod
              ? 'Crie a chave na Binance com permissão de trade SPOT, sem saque, e restrita ao IP do servidor.'
              : <>Gere chaves em <b>testnet.binance.vision</b> (login com GitHub). Elas só valem na homologação.</>}</p>
            <input placeholder="API Key" value={keys.apiKey} onChange={(e) => setKeys({ ...keys, apiKey: e.target.value })} autoComplete="off" />
            <input placeholder="Secret" type="password" value={keys.apiSecret} onChange={(e) => setKeys({ ...keys, apiSecret: e.target.value })} autoComplete="off" style={{ marginTop: 6 }} />
            <div style={{ marginTop: 6 }}><button disabled={busy || !keys.apiKey || !keys.apiSecret || !st?.cryptoReady} onClick={saveKeys}>Validar e salvar</button></div>
          </>
        )}
      </section>

      {conn?.configured && (
        <>
          <section>
            <h4>Saldo</h4>
            {!balances ? <span className="muted">Carregando…</span> : !balances.length ? <span className="muted">Sem saldo.</span> : (
              <table><tbody>{balances.map((b) => (
                <tr key={b.asset} style={b.asset === pair.base || b.asset === pair.quote ? { background: '#222a34' } : undefined}>
                  <td><b>{b.asset}</b></td><td>{trim(b.free)}</td><td className="muted">{Number(b.locked) > 0 ? `+${trim(b.locked)} em ordens` : ''}</td>
                  <td style={{ textAlign: 'right' }}>{b.brl != null ? brl(b.brl) : <span className="muted">—</span>}</td></tr>))}
                {totalBrl != null && <tr><td colSpan={3}><b>Total estimado</b></td><td style={{ textAlign: 'right' }}><b>{brl(totalBrl)}</b></td></tr>}</tbody></table>)}
            <p className="muted">Valores em reais estimados pelo preço atual da Binance (ativo → BRL, ou via USDT/BTC). Inclui o que está em ordens abertas.</p>
          </section>

          <section>
            <h4>Nova ordem · {ctx.symbol}</h4>
            <div className="row">
              <button className={o.side === 'BUY' ? 'buy' : ''} onClick={() => { setO({ ...o, side: 'BUY' }); setReview(false); }}>Comprar</button>
              <button className={o.side === 'SELL' ? 'sell' : ''} onClick={() => { setO({ ...o, side: 'SELL' }); setReview(false); }}>Vender</button>
              <select value={o.type} onChange={(e) => { setO({ ...o, type: e.target.value }); setReview(false); }}>
                <option value="MARKET">A mercado</option><option value="LIMIT">Limite</option>
              </select>
            </div>
            <div className="row">
              <input placeholder={`Quantidade (${pair.base})`} inputMode="decimal" value={o.quantity} onChange={(e) => { setO({ ...o, quantity: e.target.value }); setReview(false); }} className="grow" />
              {o.type === 'LIMIT' && <input placeholder={`Preço (${pair.quote})`} inputMode="decimal" value={o.price} onChange={(e) => { setO({ ...o, price: e.target.value }); setReview(false); }} className="grow" />}
            </div>
            <p className="muted">
              {price > 0 && <>≈ {notional.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {pair.quote} · último {price.toLocaleString('pt-BR', { maximumFractionDigits: 8 })}<br /></>}
              {rules && <>Mín. {trim(rules.rules.minQty)} {pair.base} (passo {trim(rules.rules.stepSize)}) · valor mín. {trim(rules.rules.minNotional)} {pair.quote}</>}
              {prod && st && <><br />Limite por ordem: {st.maxNotionalUsdt} USDT (só pares em stablecoin).</>}
            </p>
            {!review ? (
              <div className="row">
                <button disabled={busy || !o.quantity} onClick={() => submit(true)}>Validar (não envia)</button>
                <button disabled={busy || !o.quantity || (o.type === 'LIMIT' && !o.price)} onClick={() => { setReview(true); setAck(false); setMsg(null); }}>Revisar e enviar…</button>
              </div>
            ) : (
              <div className={prod ? 'confirm danger-box' : 'confirm'}>
                <b>{o.side === 'BUY' ? 'COMPRAR' : 'VENDER'} {o.quantity} {pair.base}</b> {o.type === 'LIMIT' ? `a ${o.price} ${pair.quote}` : 'a mercado'}<br />
                <span className="muted">{ctx.symbol} · {prod ? 'PRODUÇÃO (dinheiro real)' : 'homologação'} · ≈ {notional.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {pair.quote}</span>
                {prod && <label style={{ display: 'block', margin: '8px 0' }}><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Entendo que esta ordem usa dinheiro real.</label>}
                <div className="row" style={{ marginTop: 8 }}>
                  <button className={prod ? 'danger' : 'on'} disabled={busy || (prod && !ack)} onClick={() => submit(false)}>Confirmar envio</button>
                  <button onClick={() => setReview(false)}>Cancelar</button>
                </div>
              </div>
            )}
          </section>

          <section>
            <h4>Ordens de {ctx.symbol}</h4>
            {!orders ? <span className="muted">Carregando…</span> : (
              <>
                {orders.open.length > 0 && <div className="muted">Abertas</div>}
                <table><tbody>{orders.open.map((x) => (
                  <tr key={x.orderId}><td>{x.side === 'BUY' ? 'C' : 'V'} {trim(x.origQty)}</td><td>{trim(x.price)}</td>
                    <td><button onClick={async () => { const r = await j(`/api/trade/orders?env=${env}&symbol=${ctx.symbol}&orderId=${x.orderId}`, 'DELETE'); if (!r.ok) setMsg({ ok: false, text: (await r.json()).error }); loadOrders(); loadAccount(); }}>Cancelar</button></td></tr>))}</tbody></table>
                <div className="muted" style={{ marginTop: 6 }}>Recentes</div>
                {!orders.recent.length && <span className="muted">Nenhuma ordem.</span>}
                <table><tbody>{orders.recent.map((x) => (
                  <tr key={x.orderId}><td>{when(x.time)}</td><td>{x.side === 'BUY' ? 'C' : 'V'} {trim(x.executedQty || x.origQty)}</td><td className="muted">{x.status.toLowerCase()}</td></tr>))}</tbody></table>
              </>)}
          </section>
        </>
      )}

      {msg && <p style={{ color: msg.ok ? '#26a69a' : '#f85149', wordBreak: 'break-word' }}>{msg.text}</p>}
      <p className="muted">Ferramenta experimental, sem garantia. Cripto é volátil e você pode perder todo o valor investido. Não é recomendação de investimento.</p>
    </div>
  );
}
