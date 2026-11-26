import { pool } from '../lib/db';
import { getCandles } from '../lib/candles';
import { rsi } from '../lib/indicators';
import { latestSignal, signalBody, signalKey, signalTitle, validBells } from '../lib/signal-watch';
import { ensureSchema } from '../lib/schema';
import type { Timeframe } from '../lib/types';
import type { MarketId } from '../lib/markets';

const INTERVAL_MS = 60_000;
const COOLDOWN_MS = 60 * 60_000; // não repete o mesmo alerta em menos de 1h

async function telegram(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) { console.warn('TELEGRAM_BOT_TOKEN não definido; alerta não enviado'); return false; }
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!r.ok) console.error('Telegram falhou', r.status);
  return r.ok;
}

async function tick() {
  await ensureSchema();
  const { rows } = await pool.query(`
    SELECT a.*, u.telegram_chat_id FROM alerts a JOIN users u ON u.id=a.user_id
    WHERE a.active AND u.telegram_chat_id IS NOT NULL
      AND (a.last_fired_at IS NULL OR a.last_fired_at < now() - $1 * interval '1 millisecond')`, [COOLDOWN_MS]);
  for (const a of rows) {
    try {
      const { candles } = await getCandles(a.symbol, a.timeframe as Timeframe, a.market as MarketId);
      const last = candles.at(-1);
      if (!last) continue;
      const r = rsi(candles.map((c) => c.close)).at(-1);
      const fired =
        (a.kind === 'price_above' && last.close > a.value) ||
        (a.kind === 'price_below' && last.close < a.value) ||
        (a.kind === 'rsi_above' && r != null && r > a.value) ||
        (a.kind === 'rsi_below' && r != null && r < a.value);
      if (!fired) continue;
      await telegram(a.telegram_chat_id, `🔔 ${a.symbol} (${a.market === 'b3' ? '' : a.market + ' · '}${a.timeframe}): ${a.kind.replace('_', ' ')} ${a.value}\nÚltimo: ${last.close.toFixed(2)}${r != null ? ` · RSI ${r.toFixed(1)}` : ''}`);
      await pool.query('UPDATE alerts SET last_fired_at=now() WHERE id=$1', [a.id]);
    } catch (e) { console.error('alerta', a.id, e); }
  }
}

/**
 * Sinos de indicadores: para cada usuário com Telegram e sinos ligados, confere o último candle de cada aba
 * e avisa uma vez por sinal (indicador + candle + direção). O registro em signal_sent é o que impede repetir.
 */
async function signalTick() {
  await ensureSchema();
  const users = (await pool.query(`SELECT id, telegram_chat_id, signal_bells FROM users WHERE telegram_chat_id IS NOT NULL AND jsonb_array_length(signal_bells) > 0`)).rows;
  const cache = new Map<string, Awaited<ReturnType<typeof getCandles>>['candles'] | null>();
  for (const u of users) {
    const bells = validBells(u.signal_bells);
    const tabs = (await pool.query('SELECT DISTINCT market, symbol, timeframe FROM profiles WHERE user_id=$1', [u.id])).rows;
    for (const t of tabs) {
      const ck = `${t.market}|${t.symbol}|${t.timeframe}`;
      if (!cache.has(ck)) cache.set(ck, await getCandles(t.symbol, t.timeframe as Timeframe, t.market as MarketId).then((r) => r.candles).catch((e) => { console.error('sinal', ck, (e as Error).message); return null; }));
      const candles = cache.get(ck);
      if (!candles?.length) continue;
      for (const id of bells) {
        try {
          const f = latestSignal(candles, id, t.timeframe as Timeframe);
          if (!f) continue;
          const ins = await pool.query('INSERT INTO signal_sent(user_id,key) VALUES ($1,$2) ON CONFLICT DO NOTHING', [u.id, signalKey(ck, f)]);
          if (!ins.rowCount) continue; // já avisado
          const sent = await telegram(u.telegram_chat_id, `${signalTitle(t.symbol, t.timeframe, f)}${t.market === 'b3' ? '' : ` (${t.market})`}\n${signalBody(f)}`);
          if (!sent) await pool.query('DELETE FROM signal_sent WHERE user_id=$1 AND key=$2', [u.id, signalKey(ck, f)]); // tenta de novo no próximo ciclo
        } catch (e) { console.error('sinal', u.id, ck, id, e); }
      }
    }
  }
  await pool.query("DELETE FROM signal_sent WHERE sent_at < now() - interval '30 days'");
}

const SYNC_MS = 5 * 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Mantém o histórico próprio: para os papéis das abas e dos alertas ativos, sincroniza o timeframe em uso e o diário.
 * getCandles só chama a brapi quando precisa (mercado aberto e cache velho, ou falta o fechamento do pregão),
 * então fora do pregão este laço quase não gera requisições.
 */
async function syncHistory() {
  await ensureSchema();
  const { rows } = await pool.query(`
    SELECT market, symbol, timeframe FROM profiles
    UNION SELECT market, symbol, timeframe FROM alerts WHERE active
    UNION SELECT market, symbol, '1d' FROM profiles
    UNION SELECT market, symbol, '1d' FROM alerts WHERE active`);
  for (const r of rows) {
    try { await getCandles(r.symbol, r.timeframe as Timeframe, r.market as MarketId); } catch (e) { console.error('sync', r.market, r.symbol, r.timeframe, (e as Error).message); }
    await sleep(500); // não dispara tudo de uma vez na brapi
  }
}

console.log('worker iniciado');
setInterval(() => syncHistory().catch(console.error), SYNC_MS);
syncHistory().catch(console.error);
setInterval(() => tick().catch(console.error), INTERVAL_MS);
tick().catch(console.error);
setInterval(() => signalTick().catch(console.error), INTERVAL_MS);
signalTick().catch(console.error);
