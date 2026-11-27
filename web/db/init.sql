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

-- Sino de notícias por papel; "since" evita avisar o que já existia quando o sino foi ligado
CREATE TABLE news_bells (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  market TEXT NOT NULL, symbol TEXT NOT NULL, facts BOOLEAN NOT NULL DEFAULT true, categories JSONB NOT NULL DEFAULT '[]',
  since TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, market, symbol)
);

-- Papéis que já receberam o histórico diário longo da B3 (arquivos COTAHIST) e os desdobramentos ajustados
CREATE TABLE history_import (
  symbol TEXT PRIMARY KEY, years INT NOT NULL, candles INT NOT NULL, splits JSONB NOT NULL DEFAULT '[]',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  jumps JSONB NOT NULL DEFAULT '[]', retry_at TIMESTAMPTZ
);
CREATE TABLE history_status (
  symbol TEXT PRIMARY KEY, state TEXT NOT NULL, detail TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE journal (
  id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, market TEXT NOT NULL, env TEXT NOT NULL DEFAULT 'production', symbol TEXT NOT NULL, timeframe TEXT, indicator TEXT, exit_rule TEXT,
  stop_loss DOUBLE PRECISION, stop_gain DOUBLE PRECISION, capital DOUBLE PRECISION, risk_pct DOUBLE PRECISION, step DOUBLE PRECISION,
  ref_time DOUBLE PRECISION, note TEXT, status TEXT NOT NULL, reason TEXT,
  signal_time DOUBLE PRECISION, entry_time DOUBLE PRECISION, entry_price DOUBLE PRECISION, qty DOUBLE PRECISION,
  exit_time DOUBLE PRECISION, exit_price DOUBLE PRECISION, last_price DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE robots (
  id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  market TEXT NOT NULL, env TEXT NOT NULL DEFAULT 'production', symbol TEXT NOT NULL, timeframe TEXT NOT NULL, indicator TEXT NOT NULL,
  capital DOUBLE PRECISION NOT NULL, stop_pct DOUBLE PRECISION, gain_pct DOUBLE PRECISION, step DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL DEFAULT 'running', state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), stopped_at TIMESTAMPTZ);
