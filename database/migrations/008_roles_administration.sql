-- Фаза 7: ролі OWNER/MODERATOR, верифікація, блокування, скарги, журнал дій і системні сповіщення.

-- Крок 1: перейменувати застаріле значення 'admin' на 'owner'.
-- Значення enum у PostgreSQL не можна додавати й використовувати в тому ж транзакційному
-- блоці, тому міграцію застосовують по одному оператору (див. scripts/dev-db).
-- Умова потрібна, щоб міграцію можна було прогнати і на чистій базі: schema.sql
-- описує вже після-008 стан enum, де значення 'admin' більше немає.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = 'user_role' AND e.enumlabel = 'admin'
  ) THEN
    ALTER TYPE user_role RENAME VALUE 'admin' TO 'owner';
  END IF;
END
$$;

-- Крок 2: додати роль модератора.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'moderator';

-- Крок 3: решта змін — стовпці й таблиці.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_reason VARCHAR(300) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_blocked_idx ON users (blocked_at DESC) WHERE blocked_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_verified_idx ON users (id) WHERE is_verified = true;

CREATE TABLE IF NOT EXISTS complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complainant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  message_id BIGINT REFERENCES messages(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('spam', 'harassment', 'nsfw', 'scam', 'copyright', 'other')),
  description VARCHAR(1000) NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'closed')),
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resolution VARCHAR(500) NOT NULL DEFAULT '',
  handled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Скарга завжди на щось вказує: на акаунт і/або на конкретне повідомлення.
  CONSTRAINT complaint_target CHECK (target_user_id IS NOT NULL OR message_id IS NOT NULL),
  CONSTRAINT complaint_not_self CHECK (target_user_id IS NULL OR target_user_id <> complainant_id)
);

CREATE INDEX IF NOT EXISTS complaints_status_idx ON complaints (status, created_at DESC);
CREATE INDEX IF NOT EXISTS complaints_complainant_idx ON complaints (complainant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS complaints_target_user_idx ON complaints (target_user_id, created_at DESC)
  WHERE target_user_id IS NOT NULL;

-- Один відкритий завит на одного користувача, щоб не спамити модерацію.
CREATE UNIQUE INDEX IF NOT EXISTS complaints_open_per_target_idx
  ON complaints (complainant_id, target_user_id)
  WHERE status <> 'closed' AND target_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS admin_action_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role user_role,
  action TEXT NOT NULL CHECK (
    action IN ('user.block', 'user.unblock', 'user.delete', 'user.verify', 'user.unverify',
               'star.grant', 'star.remove', 'role.grant', 'role.revoke',
               'complaint.status', 'message.delete', 'notification.send')
  ),
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_id TEXT NOT NULL DEFAULT '',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_action_logs_created_idx ON admin_action_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_action_logs_actor_idx ON admin_action_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_action_logs_target_idx ON admin_action_logs (target_user_id, created_at DESC)
  WHERE target_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS system_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(120) NOT NULL,
  body VARCHAR(1000) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_notification_reads (
  notification_id UUID NOT NULL REFERENCES system_notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS system_notifications_created_idx ON system_notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS system_notification_reads_user_idx ON system_notification_reads (user_id);

-- Видалення акаунта не повинне знищувати створені ним групи.
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_created_by_fkey;
ALTER TABLE conversations ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE conversations
  ADD CONSTRAINT conversations_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
