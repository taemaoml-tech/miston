-- Користувацькі папки для сортування чатів.
CREATE TABLE IF NOT EXISTS chat_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(60) NOT NULL,
  color VARCHAR(24) NOT NULL DEFAULT 'blue',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_folders_user_name UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS chat_folder_items (
  folder_id UUID NOT NULL REFERENCES chat_folders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (folder_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS chat_folders_user_idx ON chat_folders (user_id, created_at);
CREATE INDEX IF NOT EXISTS chat_folder_items_user_idx ON chat_folder_items (user_id, conversation_id);
