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
      ALTER TABLE candle_sync ADD COLUMN IF NOT EXISTS gap_checked_at TIMESTAMPTZ;
      CREATE TABLE IF NOT EXISTS assets (
        symbol TEXT PRIMARY KEY, name TEXT NOT NULL);
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS market TEXT NOT NULL DEFAULT 'b3';
      ALTER TABLE alerts ADD COLUMN IF NOT EXISTS market TEXT NOT NULL DEFAULT 'b3';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS signal_bells JSONB NOT NULL DEFAULT '[]';
      CREATE TABLE IF NOT EXISTS signal_sent (
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key TEXT NOT NULL, sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, key));
      CREATE TABLE IF NOT EXISTS news (
        id SERIAL PRIMARY KEY, market TEXT NOT NULL, symbol TEXT NOT NULL DEFAULT '', url TEXT NOT NULL,
        title TEXT NOT NULL, source TEXT, kind TEXT NOT NULL, category TEXT NOT NULL,
        published_at TIMESTAMPTZ NOT NULL, date_only BOOLEAN NOT NULL DEFAULT false, fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (market, symbol, url));
      ALTER TABLE news ADD COLUMN IF NOT EXISTS source_url TEXT;
      CREATE INDEX IF NOT EXISTS news_feed ON news (market, symbol, published_at DESC);
      CREATE TABLE IF NOT EXISTS news_sync (
        market TEXT NOT NULL, symbol TEXT NOT NULL, synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (market, symbol));
      CREATE TABLE IF NOT EXISTS news_bells (
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        market TEXT NOT NULL, symbol TEXT NOT NULL, facts BOOLEAN NOT NULL DEFAULT true, categories JSONB NOT NULL DEFAULT '[]',
        since TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, market, symbol));
      CREATE TABLE IF NOT EXISTS exchange_credentials (
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        exchange TEXT NOT NULL, env TEXT NOT NULL,
        api_key TEXT NOT NULL, secret_enc TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, exchange, env));
      CREATE TABLE IF NOT EXISTS order_log (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        exchange TEXT NOT NULL, env TEXT NOT NULL, symbol TEXT NOT NULL, side TEXT NOT NULL, type TEXT NOT NULL,
        quantity TEXT, price TEXT, mode TEXT NOT NULL, ok BOOLEAN NOT NULL, result JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now());`);
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
