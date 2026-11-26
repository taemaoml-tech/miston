-- Стрічка Miston: пости, реакції, коментарі, опитування та відповідь на тему дня.
CREATE TABLE IF NOT EXISTS feed_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('projects', 'polls', 'subscriptions')),
  text TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  poll JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT feed_post_has_content CHECK (
    length(btrim(text)) > 0 OR image_url IS NOT NULL OR poll IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS feed_reactions (
  post_id UUID NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS feed_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (length(btrim(text)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feed_poll_votes (
  post_id UUID NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL CHECK (option_index >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS feed_theme_replies (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  answer TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feed_posts_created_idx ON feed_posts (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS feed_posts_author_idx ON feed_posts (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS feed_posts_category_idx ON feed_posts (category, created_at DESC);
CREATE INDEX IF NOT EXISTS feed_reactions_post_idx ON feed_reactions (post_id);
CREATE INDEX IF NOT EXISTS feed_comments_post_idx ON feed_comments (post_id, created_at ASC);
CREATE INDEX IF NOT EXISTS feed_poll_votes_post_idx ON feed_poll_votes (post_id);
CREATE INDEX IF NOT EXISTS feed_theme_replies_day_idx ON feed_theme_replies (day);
