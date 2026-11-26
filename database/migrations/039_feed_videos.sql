-- Відео у стрічці: короткі пости лишаються в загальній стрічці,
-- довгі — в окремій вкладці «Довгі».
ALTER TABLE feed_posts ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE feed_posts ADD COLUMN IF NOT EXISTS video_duration INTEGER;

ALTER TABLE feed_posts DROP CONSTRAINT IF EXISTS feed_posts_category_check;
ALTER TABLE feed_posts
  ADD CONSTRAINT feed_posts_category_check
  CHECK (category IN ('general', 'polls', 'subscriptions', 'shorts', 'longs'));

CREATE INDEX IF NOT EXISTS feed_posts_category_created_idx
  ON feed_posts (category, created_at DESC);
