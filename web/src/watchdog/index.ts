/**
 * Vigia: processo separado do worker (um worker parado não consegue avisar que parou).
 * Avisa pelo Telegram quando uma tarefa passa do prazo sem dar certo, e quando ela volta.
 */
import { pool } from '../lib/db';
import { ensureSchema } from '../lib/schema';
import { TASKS, assess, when, type TaskName } from '../lib/health';
import { readBeats } from '../lib/heartbeat';
import { telegram } from '../lib/telegram';

const EVERY_MS = 60_000;
const CONFIRM = 3; // checagens seguidas antes de avisar: evita alarme falso logo depois de ligar ou acordar a máquina
const REMIND_MS = 24 * 3600_000;

const started = Date.now();
const seen = new Map<string, number>();
let chats: string[] = []; // guardados para conseguir avisar mesmo com o banco fora do ar
let dbFails = 0, dbAlerted = false;

async function send(text: string): Promise<boolean> {
  let ok = false;
  for (const c of chats) ok = (await telegram(c, text).catch(() => false)) || ok;
  return ok;
}

const mark = (name: string, alerted: boolean) => pool.query(
  `INSERT INTO heartbeats(name,alerted_at) VALUES ($1, CASE WHEN $2 THEN now() END)
   ON CONFLICT (name) DO UPDATE SET alerted_at=EXCLUDED.alerted_at`, [name, alerted]);

async function check() {
  await ensureSchema();
  chats = (await pool.query('SELECT DISTINCT telegram_chat_id AS c FROM users WHERE telegram_chat_id IS NOT NULL')).rows.map((r) => r.c);
  const beats = await readBeats();
  const problems = assess(beats, Date.now(), started);
  const alertedAt = new Map(beats.map((b) => [b.name, b.alertedAt]));

  const due = problems.filter((p) => {
    const times = (seen.get(p.name) ?? 0) + 1;
    seen.set(p.name, times);
    const last = alertedAt.get(p.name);
    return times >= CONFIRM && (last == null || Date.now() - last >= REMIND_MS);
  });
  // uma mensagem só: quando o worker cai, várias tarefas param juntas
  if (due.length) {
    console.error('vigia: parado', due.map((p) => p.name).join(', '));
    const lines = due.map((p) => `• ${p.label} (última vez: ${when(p.okAt)})`);
    const hints = [
      due.some((p) => p.name !== 'backup') && 'Enquanto isso, não confie na falta de avisos.',
      due.some((p) => p.name === 'backup') && 'Backup: confira o serviço backup e o espaço em disco.',
    ].filter(Boolean);
    if (await send(['⚠️ Prophet: parou de funcionar', ...lines, ...hints].join('\n'))) for (const p of due) await mark(p.name, true);
  }
  const bad = new Set<string>(problems.map((p) => p.name));
  const back = (Object.keys(TASKS) as TaskName[]).filter((n) => !bad.has(n));
  for (const name of back) seen.delete(name);
  const recovered = back.filter((n) => alertedAt.get(n) != null);
  if (recovered.length && (await send(`✅ Prophet: voltou a funcionar: ${recovered.map((n) => TASKS[n].label).join(', ')}.`)))
    for (const name of recovered) await mark(name, false);
}

let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    await check();
    if (dbAlerted) await send('✅ Prophet: o banco de dados voltou a responder.');
    dbFails = 0; dbAlerted = false;
  } catch (e) {
    console.error('vigia', (e as Error).message);
    if (++dbFails >= CONFIRM && !dbAlerted) dbAlerted = await send('⚠️ Prophet: o banco de dados não está respondendo. Alertas, sinos e robôs estão parados.');
  } finally { busy = false; }
}

console.log('vigia iniciado');
setInterval(tick, EVERY_MS);
tick();
