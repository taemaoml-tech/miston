-- SMS-повідомлення про нові повідомлення (для користувачів, яких немає онлайн)

ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_notifications_enabled BOOLEAN NOT NULL DEFAULT true;

-- Журнал надісланих SMS: дає змогу не спамити в одну й ту саму розмову.
CREATE TABLE IF NOT EXISTS sms_notification_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  message_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sms_notification_log_lookup_idx
  ON sms_notification_log (user_id, conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sms_notification_log_user_day_idx
  ON sms_notification_log (user_id, created_at DESC);
