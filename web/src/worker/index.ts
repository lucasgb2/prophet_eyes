import { pool } from '../lib/db';
import { getCandles } from '../lib/candles';
import { rsi } from '../lib/indicators';
import { NEWS_EVERY_MS, syncNews } from '../lib/news/collect';
import { pendingNews } from '../lib/news/alerts';
import { historyYears, importHistory, jumpedSymbols, pendingSymbols } from '../lib/cotahist-import';
import { refreshJournal } from '../lib/journal-store';
import { runRobots } from '../lib/robot-store';
import { fmtPrice } from '../lib/markets';
import { INDICATORS } from '../lib/indicators';
import { alertKey, dedupeByTitle, groupMessage } from '../lib/news/alert-text';
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

/** Coleta notícias do mercado e dos papéis das abas e alertas, para ir formando histórico. */
async function newsTick() {
  await ensureSchema();
  const { rows } = await pool.query(`SELECT market, symbol FROM profiles UNION SELECT market, symbol FROM alerts WHERE active UNION SELECT market, symbol FROM news_bells`);
  const targets = [{ market: 'b3', symbol: '' }, { market: 'binance', symbol: '' }, ...rows];
  for (const t of targets) {
    try { for (const e of await syncNews(t.market as MarketId, t.symbol)) console.error('notícias', t.market, t.symbol || 'geral', e); }
    catch (e) { console.error('notícias', t.market, t.symbol || 'geral', (e as Error).message); }
    await sleep(1000);
  }
}

/** Sino de notícias: manda pelo Telegram o que chegou de novo, uma mensagem por papel. */
async function newsBellTick() {
  await ensureSchema();
  const users = (await pool.query(`SELECT DISTINCT u.id, u.telegram_chat_id FROM users u JOIN news_bells b ON b.user_id=u.id WHERE u.telegram_chat_id IS NOT NULL`)).rows;
  for (const u of users) {
    try {
      // registra antes de enviar (é o que impede repetir); desfaz se o envio falhar
      const claimed = [];
      for (const n of await pendingNews(u.id)) {
        if ((await pool.query('INSERT INTO signal_sent(user_id,key) VALUES ($1,$2) ON CONFLICT DO NOTHING', [u.id, alertKey(n)])).rowCount) claimed.push(n);
      }
      for (const symbol of new Set(claimed.map((n) => n.symbol))) {
        const mine = claimed.filter((n) => n.symbol === symbol);
        const sent = await telegram(u.telegram_chat_id, groupMessage(symbol, dedupeByTitle(mine))).catch(() => false);
        if (!sent) await pool.query('DELETE FROM signal_sent WHERE user_id=$1 AND key = ANY($2)', [u.id, mine.map(alertKey)]);
      }
    } catch (e) { console.error('sino de notícias', u.id, e); }
  }
}

/** Histórico diário longo (arquivos da B3): papéis em uso que não têm, e os que sofreram desdobramento depois. São centenas de MB. */
let historyBusy = false, historyRetryAt = 0;
async function historyTick() {
  if (historyBusy || !historyYears() || Date.now() < historyRetryAt) return;
  historyBusy = true;
  try {
    await ensureSchema();
    const symbols = [...new Set([...(await pendingSymbols()), ...(await jumpedSymbols())])];
    if (!symbols.length) return;
    console.log('histórico B3: importando', symbols.join(', '));
    console.log('histórico B3: candles importados', JSON.stringify(await importHistory(symbols)));
  } catch (e) {
    historyRetryAt = Date.now() + 6 * 3600_000; // não baixa tudo de novo a cada ciclo se a B3 estiver com problema
    console.error('histórico B3 falhou (tenta de novo em 6 h):', (e as Error).message);
  } finally { historyBusy = false; }
}

console.log('worker iniciado');
setInterval(() => historyTick().catch(console.error), 15_000); // só consulta o banco; baixa quando há pendência
historyTick().catch(console.error);
setInterval(() => newsBellTick().catch(console.error), INTERVAL_MS);
newsBellTick().catch(console.error);
setInterval(() => newsTick().catch(console.error), NEWS_EVERY_MS + 5000); // um pouco depois do limite de 15 min
newsTick().catch(console.error);
setInterval(() => syncHistory().catch(console.error), SYNC_MS);
syncHistory().catch(console.error);
setInterval(() => tick().catch(console.error), INTERVAL_MS);
tick().catch(console.error);
const journalTick = () => ensureSchema().then(() => refreshJournal()).catch(console.error);
setInterval(journalTick, INTERVAL_MS);
journalTick();
/** Robôs de teste: avança e avisa compras e vendas simuladas pelo Telegram. */
let robotBusy = false;
async function robotTick() {
  if (robotBusy) return;
  robotBusy = true;
  try {
    await ensureSchema();
    await runRobots(async (userId, r, e) => {
      const chat = (await pool.query('SELECT telegram_chat_id FROM users WHERE id=$1', [userId])).rows[0]?.telegram_chat_id;
      if (!chat) return;
      const px = (n: number) => fmtPrice(r.market, r.symbol, n);
      const what = e.type === 'buy' ? `COMPRA simulada a ${px(e.price)}`
        : `VENDA simulada a ${px(e.trade.exitPrice)} (${e.trade.reason}): ${e.trade.pct >= 0 ? '+' : ''}${e.trade.pct.toFixed(2).replace('.', ',')}%`;
      await telegram(chat, `🤖 Robô de teste · ${r.symbol} · ${r.timeframe} · ${INDICATORS[r.indicator].label}\n${what}\nSimulação: nenhuma ordem foi enviada.`);
    });
  } catch (e) { console.error('robô', e); } finally { robotBusy = false; }
}
setInterval(robotTick, INTERVAL_MS);
robotTick();
setInterval(() => signalTick().catch(console.error), INTERVAL_MS);
signalTick().catch(console.error);
