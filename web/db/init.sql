CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  telegram_chat_id TEXT,
  signal_bells JSONB NOT NULL DEFAULT '[]',   -- indicadores com sino ligado (aviso no navegador e no Telegram)
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

-- Sinais já avisados (evita repetir o mesmo sinal: indicador + candle + direção)
CREATE TABLE signal_sent (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- Notícias coletadas (symbol '' = notícias gerais do mercado). Ficam guardadas para medir a reação do preço.
CREATE TABLE news (
  id SERIAL PRIMARY KEY, market TEXT NOT NULL, symbol TEXT NOT NULL DEFAULT '', url TEXT NOT NULL,
  title TEXT NOT NULL, source TEXT, source_url TEXT, kind TEXT NOT NULL, category TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL, date_only BOOLEAN NOT NULL DEFAULT false, fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (market, symbol, url)
);
CREATE INDEX news_feed ON news (market, symbol, published_at DESC);
CREATE TABLE news_sync (
  market TEXT NOT NULL, symbol TEXT NOT NULL, synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (market, symbol)
);
