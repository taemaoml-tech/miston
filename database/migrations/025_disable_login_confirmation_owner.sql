-- Вимикаємо підтвердження входу (8-значний код у бота Miston) для всіх власників.
UPDATE users SET skip_login_confirmation = true WHERE role = 'owner';
-- Також для акаунта omelchenkostep на випадок, якщо роль інша.
UPDATE users SET skip_login_confirmation = true WHERE username = 'omelchenkostep';
