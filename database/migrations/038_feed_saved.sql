-- Стрічка без ігор і проєктів: нейтральна категорія та приватні закладки.
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'feed_posts'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%category%'
  LOOP
    EXECUTE format('ALTER TABLE feed_posts DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

UPDATE feed_posts SET category = 'general' WHERE category = 'projects';

ALTER TABLE feed_posts
  ADD CONSTRAINT feed_posts_category_check
  CHECK (category IN ('general', 'polls', 'subscriptions'));

CREATE TABLE IF NOT EXISTS feed_saved_posts (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS feed_saved_posts_user_idx
  ON feed_saved_posts (user_id, created_at DESC);
