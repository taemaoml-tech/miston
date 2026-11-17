-- Mist ID: унікальний ідентифікатор користувача у форматі username@mist.id
ALTER TABLE users ADD COLUMN IF NOT EXISTS mist_id VARCHAR(64) UNIQUE;

-- Заповнюємо mist_id для існуючих користувачів (якщо ще не заповнено)
UPDATE users SET mist_id = username || '@mist.id' WHERE mist_id IS NULL;

-- Таблиця вхідних повідомлень Mist ID (системні сповіщення акаунту)
CREATE TABLE IF NOT EXISTS mist_id_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  kind VARCHAR(32) NOT NULL DEFAULT 'system',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mist_id_inbox_user_idx ON mist_id_inbox (user_id, created_at DESC);

-- Таблиця QR-токенів для входу (одноразові, короткоживучі)
CREATE TABLE IF NOT EXISTS mist_qr_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(64) NOT NULL UNIQUE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  consumed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mist_qr_tokens_token_idx ON mist_qr_tokens (token);
