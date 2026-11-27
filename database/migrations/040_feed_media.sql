-- Кілька фото/відео в одному пості. Старі колонки лишаються для сумісності.
ALTER TABLE feed_posts
  ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE feed_posts DROP CONSTRAINT IF EXISTS feed_post_has_content;
ALTER TABLE feed_posts
  ADD CONSTRAINT feed_post_has_content CHECK (
    length(btrim(text)) > 0
    OR image_url IS NOT NULL
    OR video_url IS NOT NULL
    OR jsonb_array_length(media) > 0
    OR poll IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS feed_posts_media_gin_idx ON feed_posts USING gin (media);
