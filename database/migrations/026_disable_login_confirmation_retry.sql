-- Повторно вимикаємо підтвердження входу для власників (на випадок, якщо попередня міграція не спрацювала).
ALTER TABLE users ADD COLUMN IF NOT EXISTS skip_login_confirmation BOOLEAN NOT NULL DEFAULT false;
UPDATE users SET skip_login_confirmation = true WHERE role = 'owner';
UPDATE users SET skip_login_confirmation = true WHERE username = 'omelchenkostep';
