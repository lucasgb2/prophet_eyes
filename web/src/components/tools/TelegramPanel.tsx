'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ToolCtx } from './registry';

type Alert = { id: number; market?: string; symbol: string; timeframe: string; kind: string; value: number };
const j = (url: string, method = 'GET', body?: unknown) =>
  fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

export default function TelegramPanel({ ctx }: { ctx: ToolCtx }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [chatId, setChatId] = useState('');
  const [saved, setSaved] = useState(false);
  const [newAlert, setNewAlert] = useState({ kind: 'price_above', value: '' });

  const load = useCallback(() => j('/api/alerts').then((r) => r.json()).then((d) => { setAlerts(d.alerts); setChatId(d.telegramChatId ?? ''); }), []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="stack">
      <section>
        <h4>Conexão</h4>
        <p className="muted">1) Abra o bot do Prophet no Telegram e envie /start. 2) Descubra seu chat_id com o @userinfobot e cole abaixo.</p>
        <div className="row">
          <input placeholder="seu chat_id" value={chatId} onChange={(e) => { setChatId(e.target.value); setSaved(false); }} className="grow" />
          <button onClick={async () => { await j('/api/alerts', 'PUT', { telegramChatId: chatId }); setSaved(true); }}>Salvar</button>
        </div>
        {saved && <span className="muted">Salvo.</span>}
      </section>
      <section>
        <h4>Novo alerta para {ctx.symbol} ({ctx.timeframe})</h4>
        <div className="row">
          <select value={newAlert.kind} onChange={(e) => setNewAlert({ ...newAlert, kind: e.target.value })}>
            <option value="price_above">preço acima de</option><option value="price_below">preço abaixo de</option>
            <option value="rsi_above">RSI acima de</option><option value="rsi_below">RSI abaixo de</option>
          </select>
          <input type="number" step="any" placeholder="valor" value={newAlert.value} onChange={(e) => setNewAlert({ ...newAlert, value: e.target.value })} style={{ width: 90 }} />
        </div>
        <button disabled={!newAlert.value} onClick={async () => { await j('/api/alerts', 'POST', { ...newAlert, market: ctx.market, symbol: ctx.symbol, timeframe: ctx.timeframe }); setNewAlert({ ...newAlert, value: '' }); load(); }}>
          Criar alerta
        </button>
      </section>
      <section>
        <h4>Meus alertas</h4>
        {!alerts.length && <span className="muted">Nenhum alerta ainda.</span>}
        <table><tbody>{alerts.map((a) => (
          <tr key={a.id}><td>{a.symbol} {a.timeframe}{a.market && a.market !== 'b3' ? ` · ${a.market}` : ''}</td><td>{a.kind.replace('_', ' ')} {a.value}</td>
            <td><button onClick={async () => { await j(`/api/alerts?id=${a.id}`, 'DELETE'); load(); }}>×</button></td></tr>))}</tbody></table>
      </section>
    </div>
  );
}
