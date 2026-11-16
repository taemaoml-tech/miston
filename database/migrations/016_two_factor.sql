-- Двоетапна перевірка (Telegram-style): додатковий пароль при вході.

ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_hint VARCHAR(100);

-- Короткоживучі запити на другий етап перевірки після успішного коду входу.
CREATE TABLE IF NOT EXISTS two_factor_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS two_factor_challenges_user_idx
  ON two_factor_challenges (user_id, created_at DESC);
