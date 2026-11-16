-- Підтвердження входу: код приходить у чат із ботом Miston, а якщо немає
-- доступу до застосунку — SMS на підтверджений номер телефону.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false;

-- Службовий акаунт, від імені якого надсилаються коди та службові повідомлення.
INSERT INTO users (email, username, display_name, password_hash, role, is_verified, is_bot)
SELECT 'miston-bot@miston.local', 'miston_bot', 'Miston', '!service-account-no-login', 'user', true, true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE is_bot = true);

CREATE TABLE IF NOT EXISTS login_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  delivery VARCHAR(16) NOT NULL CHECK (delivery IN ('miston', 'sms')),
  phone_number VARCHAR(20),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  message_id BIGINT REFERENCES messages(id) ON DELETE SET NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_challenges_user_idx
  ON login_challenges (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS login_challenges_pending_idx
  ON login_challenges (user_id) WHERE consumed_at IS NULL;

-- Дані пристрою для списку активних сесій у налаштуваннях безпеки.
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS user_agent VARCHAR(300);
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64);
