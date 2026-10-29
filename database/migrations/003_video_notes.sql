-- Adds circular video notes. PostgreSQL 12+ allows ADD VALUE outside a transaction;
-- this file runs as a standalone migration, so it is safe on 14+.
ALTER TYPE message_kind ADD VALUE IF NOT EXISTS 'video_note';

-- Video notes are capped at one minute in the API; keep a defensive constraint
-- for rows created outside the application.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS message_video_note_duration;
ALTER TABLE messages ADD CONSTRAINT message_video_note_duration
  CHECK (kind <> 'video_note' OR duration_seconds IS NULL OR duration_seconds <= 60);
