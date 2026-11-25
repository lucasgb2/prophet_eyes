import { pool } from './db';
import { SEED_ASSETS } from './seed-assets';

/**
 * Migração idempotente executada uma vez por processo (web e worker).
 * Serve para bancos já criados antes destas tabelas existirem; o init.sql cobre instalações novas.
 * Um advisory lock evita corrida entre web e worker subindo ao mesmo tempo.
 */
const g = globalThis as any;

async function run() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727001)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS candles (
        symbol TEXT NOT NULL, timeframe TEXT NOT NULL, ts TIMESTAMPTZ NOT NULL,
        open DOUBLE PRECISION, high DOUBLE PRECISION, low DOUBLE PRECISION,
        close DOUBLE PRECISION, volume DOUBLE PRECISION,
        PRIMARY KEY (symbol, timeframe, ts));
      CREATE TABLE IF NOT EXISTS candle_sync (
        symbol TEXT NOT NULL, timeframe TEXT NOT NULL, synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (symbol, timeframe));
      CREATE TABLE IF NOT EXISTS assets (
        symbol TEXT PRIMARY KEY, name TEXT NOT NULL);`);
    try { await client.query("SELECT create_hypertable('candles','ts', if_not_exists => true)"); } catch { /* sem TimescaleDB: tabela comum */ }
    const { rows } = await client.query('SELECT count(*)::int AS n FROM assets');
    if (rows[0].n === 0) {
      await client.query(
        'INSERT INTO assets(symbol,name) SELECT * FROM unnest($1::text[],$2::text[]) ON CONFLICT DO NOTHING',
        [SEED_ASSETS.map((a) => a[0]), SEED_ASSETS.map((a) => a[1])]);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => {});
    client.release();
  }
}

export function ensureSchema(): Promise<void> {
  if (!g.__schemaReady) g.__schemaReady = run().catch((e) => { g.__schemaReady = undefined; throw e; });
  return g.__schemaReady;
}
