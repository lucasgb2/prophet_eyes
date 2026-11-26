CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  telegram_chat_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Perfil = aba do usuário (ativo, timeframe e indicadores escolhidos)
CREATE TABLE profiles (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  market TEXT NOT NULL DEFAULT 'b3',   -- 'b3' | 'binance'
  symbol TEXT NOT NULL DEFAULT 'PETR4',
  timeframe TEXT NOT NULL DEFAULT '1d',
  indicators JSONB NOT NULL DEFAULT '[]',
  position INT NOT NULL DEFAULT 0
);

-- Alerta por usuário, entregue via Telegram pelo worker
CREATE TABLE alerts (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  market TEXT NOT NULL DEFAULT 'b3',
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL DEFAULT '1d',
  kind TEXT NOT NULL,            -- 'price_above' | 'price_below' | 'rsi_above' | 'rsi_below'
  value DOUBLE PRECISION NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  last_fired_at TIMESTAMPTZ
);

-- Cache de candles (hypertable). Ainda não usado no esqueleto; ver docs/arquitetura.md
CREATE TABLE candles (
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  open DOUBLE PRECISION, high DOUBLE PRECISION, low DOUBLE PRECISION,
  close DOUBLE PRECISION, volume DOUBLE PRECISION,
  PRIMARY KEY (symbol, timeframe, ts)
);
SELECT create_hypertable('candles', 'ts');
