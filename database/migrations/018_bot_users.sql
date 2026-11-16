-- Боти Miston мають власний акаунт користувача для відправки повідомлень.
ALTER TABLE bots ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Заповнюємо user_id для вже створених ботів (якщо є): створюємо акаунт.
DO $$
DECLARE
  b RECORD;
  uid UUID;
BEGIN
  FOR b IN SELECT id, username, display_name FROM bots WHERE user_id IS NULL LOOP
    INSERT INTO users (email, username, display_name, password_hash, role, is_verified, is_bot)
    VALUES (b.username || '@bot.miston.local', b.username, b.display_name, '!bot-no-login', 'user', true, true)
    ON CONFLICT (username) DO UPDATE SET is_bot = true
    RETURNING id INTO uid;
    IF uid IS NULL THEN
      SELECT id INTO uid FROM users WHERE username = b.username;
    END IF;
    UPDATE bots SET user_id = uid WHERE id = b.id;
  END LOOP;
END $$;
