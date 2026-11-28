import { pool } from './db';
import type { Beat, TaskName } from './health';

/** Registra que a tarefa acabou de dar certo. Falha ao registrar não derruba a tarefa. */
export const beat = (name: TaskName) => pool.query(
  'INSERT INTO heartbeats(name,ok_at) VALUES ($1,now()) ON CONFLICT (name) DO UPDATE SET ok_at=now()', [name])
  .then(() => {}, (e) => console.error('heartbeat', name, e.message));

export async function readBeats(): Promise<(Beat & { alertedAt: number | null })[]> {
  const { rows } = await pool.query(
    `SELECT name, extract(epoch from ok_at)*1000 AS ok, extract(epoch from alerted_at)*1000 AS alerted FROM heartbeats`);
  return rows.map((r) => ({ name: r.name, okAt: r.ok == null ? null : Number(r.ok), alertedAt: r.alerted == null ? null : Number(r.alerted) }));
}
