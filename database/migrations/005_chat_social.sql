-- Reply, forwarding, mentions and private friend aliases.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_id BIGINT REFERENCES messages(id) ON DELETE SET NULL;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS forwarded_from_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS forwarded_from_conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS forwarded_from_message_id BIGINT;

CREATE TABLE IF NOT EXISTS message_mentions (
  message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS message_mentions_user_idx ON message_mentions (user_id, message_id);

-- A local alias changes how a friend is shown to its owner only.
CREATE TABLE IF NOT EXISTS friend_aliases (
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alias VARCHAR(80) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, friend_id),
  CONSTRAINT friend_alias_not_self CHECK (owner_id <> friend_id)
);
