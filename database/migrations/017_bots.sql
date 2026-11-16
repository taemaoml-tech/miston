-- Боти Miston: створення через BotFather, API-ключі, оновлення та команди.

CREATE TABLE IF NOT EXISTS bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username CITEXT NOT NULL UNIQUE,
  display_name VARCHAR(80) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  token TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  avatar_url TEXT,
  fun_mode BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bot_username_suffix CHECK (username::text LIKE '%bot')
);

CREATE INDEX IF NOT EXISTS bots_owner_idx ON bots (owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bot_commands (
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  command VARCHAR(32) NOT NULL,
  description VARCHAR(256) NOT NULL DEFAULT '',
  PRIMARY KEY (bot_id, command)
);

CREATE TABLE IF NOT EXISTS bot_updates (
  id BIGSERIAL PRIMARY KEY,
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  update_type VARCHAR(32) NOT NULL DEFAULT 'message',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  consumed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_updates_bot_idx ON bot_updates (bot_id, id);

-- Службовий акаунт BotFather (якщо ще не створений).
INSERT INTO users (email, username, display_name, password_hash, role, is_verified, is_bot)
SELECT 'botfather@miston.local', 'botfather', 'BotFather', '!service-account-no-login', 'user', true, true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'botfather');
