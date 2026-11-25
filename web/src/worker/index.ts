import { pool } from '../lib/db';
import { getCandles } from '../lib/candles';
import { rsi } from '../lib/indicators';
import type { Timeframe } from '../lib/types';

const INTERVAL_MS = 60_000;
const COOLDOWN_MS = 60 * 60_000; // não repete o mesmo alerta em menos de 1h

async function telegram(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return console.warn('TELEGRAM_BOT_TOKEN não definido; alerta não enviado');
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!r.ok) console.error('Telegram falhou', r.status);
}

async function tick() {
  const { rows } = await pool.query(`
    SELECT a.*, u.telegram_chat_id FROM alerts a JOIN users u ON u.id=a.user_id
    WHERE a.active AND u.telegram_chat_id IS NOT NULL
      AND (a.last_fired_at IS NULL OR a.last_fired_at < now() - $1 * interval '1 millisecond')`, [COOLDOWN_MS]);
  for (const a of rows) {
    try {
      const { candles } = await getCandles(a.symbol, a.timeframe as Timeframe);
      const last = candles.at(-1);
      if (!last) continue;
      const r = rsi(candles.map((c) => c.close)).at(-1);
      const fired =
        (a.kind === 'price_above' && last.close > a.value) ||
        (a.kind === 'price_below' && last.close < a.value) ||
        (a.kind === 'rsi_above' && r != null && r > a.value) ||
        (a.kind === 'rsi_below' && r != null && r < a.value);
      if (!fired) continue;
      await telegram(a.telegram_chat_id, `🔔 ${a.symbol} (${a.timeframe}): ${a.kind.replace('_', ' ')} ${a.value}\nÚltimo: ${last.close.toFixed(2)}${r != null ? ` · RSI ${r.toFixed(1)}` : ''}`);
      await pool.query('UPDATE alerts SET last_fired_at=now() WHERE id=$1', [a.id]);
    } catch (e) { console.error('alerta', a.id, e); }
  }
}

const SYNC_MS = 5 * 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Mantém o histórico próprio: para os papéis das abas e dos alertas ativos, sincroniza o timeframe em uso e o diário.
 * getCandles só chama a brapi quando precisa (mercado aberto e cache velho, ou falta o fechamento do pregão),
 * então fora do pregão este laço quase não gera requisições.
 */
async function syncHistory() {
  const { rows } = await pool.query(`
    SELECT symbol, timeframe FROM profiles
    UNION SELECT symbol, timeframe FROM alerts WHERE active
    UNION SELECT symbol, '1d' FROM profiles
    UNION SELECT symbol, '1d' FROM alerts WHERE active`);
  for (const r of rows) {
    try { await getCandles(r.symbol, r.timeframe as Timeframe); } catch (e) { console.error('sync', r.symbol, r.timeframe, (e as Error).message); }
    await sleep(500); // não dispara tudo de uma vez na brapi
  }
}

console.log('worker iniciado');
setInterval(() => syncHistory().catch(console.error), SYNC_MS);
syncHistory().catch(console.error);
setInterval(() => tick().catch(console.error), INTERVAL_MS);
tick().catch(console.error);
