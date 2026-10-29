-- Фаза 9B: сторінка «Зв'язатися з адміністрацією».
-- Запити підтримки може надсилати й гість, тому user_id і contact_email
-- альтернативні: один із двох обов'язковий.

CREATE TABLE support_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  contact_email VARCHAR(160),
  topic VARCHAR(32) NOT NULL DEFAULT 'other',
  message VARCHAR(2000) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'in_progress', 'closed')),
  resolution VARCHAR(1000) NOT NULL DEFAULT '',
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR contact_email IS NOT NULL)
);

CREATE INDEX support_requests_created_idx ON support_requests (created_at DESC);
CREATE INDEX support_requests_status_idx ON support_requests (status, created_at DESC);
CREATE INDEX support_requests_user_idx ON support_requests (user_id, created_at DESC);

-- Дії модераторів із запитами підтримки теж потрапляють у журнал.
ALTER TABLE admin_action_logs DROP CONSTRAINT admin_action_logs_action_check;
ALTER TABLE admin_action_logs ADD CONSTRAINT admin_action_logs_action_check CHECK (
  action IN ('user.block', 'user.unblock', 'user.delete', 'user.verify', 'user.unverify',
             'star.grant', 'star.remove', 'role.grant', 'role.revoke',
             'complaint.status', 'message.delete', 'notification.send', 'support.status')
);
