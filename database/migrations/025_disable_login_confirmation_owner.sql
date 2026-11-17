-- Знову вимикаємо підтвердження входу (8-значний код у бота Miston) для власника.
UPDATE users SET skip_login_confirmation = true WHERE username = 'omelchenkostep';
