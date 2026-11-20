-- Наскрізне шифрування (E2EE).
-- Сервер зберігає лише публічні ключі, загорнуті ключі розмов і зашифровану
-- резервну копію приватного ключа. Відкритий текст ніколи не потрапляє на сервер.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS e2ee_public_key TEXT,
  ADD COLUMN IF NOT EXISTS e2ee_public_key_updated_at TIMESTAMPTZ;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS encrypted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS encryption_version SMALLINT;

-- Один випадковий ключ розмови, загорнутий окремо для кожного учасника.
CREATE TABLE IF NOT EXISTS e2ee_conversation_keys (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wrapped_key TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS e2ee_conversation_keys_user_idx
  ON e2ee_conversation_keys (user_id);

-- Резервна копія приватного ключа, зашифрована паролем користувача (PBKDF2).
-- Сервер не знає пароля й не може розшифрувати цей blob.
CREATE TABLE IF NOT EXISTS e2ee_backups (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  salt TEXT NOT NULL,
  iv TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iterations INTEGER NOT NULL DEFAULT 210000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
