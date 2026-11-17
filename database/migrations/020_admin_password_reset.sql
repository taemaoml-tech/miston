-- Нові дії адмін-панелі у журналі: скидання пароля та вимкнення 2FA.
-- Старий CHECK не знав навіть про support.status, тому замінюємо повний список.

ALTER TABLE admin_action_logs DROP CONSTRAINT IF EXISTS admin_action_logs_action_check;

ALTER TABLE admin_action_logs ADD CONSTRAINT admin_action_logs_action_check CHECK (
  action IN ('user.block', 'user.unblock', 'user.delete', 'user.verify', 'user.unverify',
             'user.password_reset', 'user.2fa.disable',
             'star.grant', 'star.remove', 'role.grant', 'role.revoke',
             'complaint.status', 'message.delete', 'notification.send', 'support.status')
);
