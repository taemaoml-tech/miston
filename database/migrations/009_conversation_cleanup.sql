-- Фаза 8: «Очистити історію» і «Видалити чат» для окремого учасника.
-- Водойма cleared_after_id ховає старі повідомлення лише в цьому учасника,
-- hidden_at прибирає розмову зі списку, доки не надійде нове повідомлення.

ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS cleared_after_id BIGINT NOT NULL DEFAULT 0;
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
