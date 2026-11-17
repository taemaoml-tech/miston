-- Прапорець «не вимагати код підтвердження входу» для конкретних акаунтів
-- (наприклад, для власника, щоб увійти без коду в бота Miston).
ALTER TABLE users ADD COLUMN IF NOT EXISTS skip_login_confirmation BOOLEAN NOT NULL DEFAULT false;

-- Вимикаємо підтвердження входу для власників.
UPDATE users SET skip_login_confirmation = true WHERE role = 'owner';
