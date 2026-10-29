CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Порядок значень збігається з порядком після міграції 008 ('admin' було перейменовано на 'owner').
CREATE TYPE user_role AS ENUM ('user', 'owner', 'moderator');
CREATE TYPE conversation_kind AS ENUM ('direct', 'group', 'channel');
CREATE TYPE member_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE message_kind AS ENUM ('text', 'image', 'video', 'video_note', 'document', 'voice', 'sticker');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT NOT NULL UNIQUE,
  username CITEXT NOT NULL UNIQUE,
  display_name VARCHAR(80) NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_url TEXT,
  bio VARCHAR(500) NOT NULL DEFAULT '',
  role user_role NOT NULL DEFAULT 'user',
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  blocked_at TIMESTAMPTZ,
  blocked_until TIMESTAMPTZ,
  blocked_reason VARCHAR(300) NOT NULL DEFAULT '',
  blocked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  icon_url TEXT,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE server_members (
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role member_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, user_id)
);

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind conversation_kind NOT NULL,
  title VARCHAR(100),
  avatar_url TEXT,
  direct_key TEXT UNIQUE,
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT direct_shape CHECK (
    (kind = 'direct' AND direct_key IS NOT NULL AND server_id IS NULL AND title IS NULL)
    OR (kind = 'group' AND direct_key IS NULL AND server_id IS NULL AND title IS NOT NULL)
    OR (kind = 'channel' AND direct_key IS NULL AND server_id IS NOT NULL AND title IS NOT NULL)
  )
);

CREATE TABLE conversation_members (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role member_role NOT NULL DEFAULT 'member',
  last_read_message_id BIGINT,
  cleared_after_id BIGINT NOT NULL DEFAULT 0,
  hidden_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS sticker_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(200) NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'custom',
  cover_asset TEXT NOT NULL DEFAULT '',
  is_animated BOOLEAN NOT NULL DEFAULT false,
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  is_public BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sticker_pack_category CHECK (
    category IN ('emotions', 'memes', 'animals', 'games', 'holidays', 'anime', 'reactions', 'custom')
  ),
  -- Вбудовані набори не мають власника, користувацькі — завжди мають.
  CONSTRAINT sticker_pack_ownership CHECK (
    (category = 'custom' AND owner_id IS NOT NULL) OR (category <> 'custom' AND owner_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS sticker_packs_owner_idx ON sticker_packs (owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sticker_packs_category_idx ON sticker_packs (category, sort_order);

CREATE TABLE IF NOT EXISTS stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES sticker_packs(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  label VARCHAR(80) NOT NULL,
  keywords TEXT NOT NULL DEFAULT '',
  asset TEXT NOT NULL,
  animation TEXT NOT NULL DEFAULT '',
  width SMALLINT NOT NULL DEFAULT 320,
  height SMALLINT NOT NULL DEFAULT 320,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pack_id, slug),
  CONSTRAINT sticker_asset_present CHECK (length(trim(asset)) > 0)
);

CREATE INDEX IF NOT EXISTS stickers_pack_idx ON stickers (pack_id, sort_order);

CREATE TABLE IF NOT EXISTS sticker_favorites (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sticker_id UUID NOT NULL REFERENCES stickers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, sticker_id)
);

CREATE TABLE IF NOT EXISTS sticker_recents (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sticker_id UUID NOT NULL REFERENCES stickers(id) ON DELETE CASCADE,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, sticker_id)
);

CREATE TABLE messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind message_kind NOT NULL DEFAULT 'text',
  content TEXT NOT NULL DEFAULT '',
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  pinned_at TIMESTAMPTZ,
  pinned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  sticker_id UUID REFERENCES stickers(id) ON DELETE SET NULL,
  CONSTRAINT message_payload CHECK (
    (kind = 'text' AND length(trim(content)) > 0)
    OR (kind = 'sticker' AND (sticker_id IS NOT NULL OR length(trim(content)) > 0))
    OR (kind <> 'text' AND kind <> 'sticker')
  )
);

CREATE TABLE message_reactions (
  message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(150) NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE friendships (
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  PRIMARY KEY (requester_id, addressee_id),
  CONSTRAINT friendship_not_self CHECK (requester_id <> addressee_id)
);

CREATE INDEX messages_conversation_cursor_idx ON messages (conversation_id, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX messages_pinned_idx ON messages (conversation_id, pinned_at DESC) WHERE pinned_at IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX messages_sticker_idx ON messages (sticker_id) WHERE sticker_id IS NOT NULL;
CREATE INDEX message_reactions_message_idx ON message_reactions (message_id);
CREATE INDEX conversation_members_user_idx ON conversation_members (user_id, conversation_id);
CREATE INDEX server_members_user_idx ON server_members (user_id, server_id);
CREATE INDEX conversations_server_idx ON conversations (server_id, title) WHERE kind = 'channel';
CREATE INDEX users_username_search_idx ON users USING gin (username gin_trgm_ops);
CREATE INDEX users_display_name_search_idx ON users USING gin (display_name gin_trgm_ops);
CREATE INDEX refresh_tokens_user_expiry_idx ON refresh_tokens (user_id, expires_at);
CREATE UNIQUE INDEX friendships_pair_idx ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX friendships_addressee_idx ON friendships (addressee_id, status);
CREATE INDEX friendships_requester_idx ON friendships (requester_id, status);

-- Фаза 7: модерація.

CREATE INDEX users_blocked_idx ON users (blocked_at DESC) WHERE blocked_at IS NOT NULL;
CREATE INDEX users_verified_idx ON users (id) WHERE is_verified = true;

CREATE TABLE complaints (
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
  CONSTRAINT complaint_target CHECK (target_user_id IS NOT NULL OR message_id IS NOT NULL),
  CONSTRAINT complaint_not_self CHECK (target_user_id IS NULL OR target_user_id <> complainant_id)
);

CREATE INDEX complaints_status_idx ON complaints (status, created_at DESC);
CREATE INDEX complaints_complainant_idx ON complaints (complainant_id, created_at DESC);
CREATE INDEX complaints_target_user_idx ON complaints (target_user_id, created_at DESC)
  WHERE target_user_id IS NOT NULL;

CREATE UNIQUE INDEX complaints_open_per_target_idx
  ON complaints (complainant_id, target_user_id)
  WHERE status <> 'closed' AND target_user_id IS NOT NULL;

CREATE TABLE admin_action_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role user_role,
  action TEXT NOT NULL CHECK (
    action IN ('user.block', 'user.unblock', 'user.delete', 'user.verify', 'user.unverify',
               'star.grant', 'star.remove', 'role.grant', 'role.revoke',
               'complaint.status', 'message.delete', 'notification.send', 'support.status')
  ),
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_id TEXT NOT NULL DEFAULT '',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX admin_action_logs_created_idx ON admin_action_logs (created_at DESC);
CREATE INDEX admin_action_logs_actor_idx ON admin_action_logs (actor_id, created_at DESC);
CREATE INDEX admin_action_logs_target_idx ON admin_action_logs (target_user_id, created_at DESC)
  WHERE target_user_id IS NOT NULL;

CREATE TABLE system_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(120) NOT NULL,
  body VARCHAR(1000) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE system_notification_reads (
  notification_id UUID NOT NULL REFERENCES system_notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX system_notifications_created_idx ON system_notifications (created_at DESC);
CREATE INDEX system_notification_reads_user_idx ON system_notification_reads (user_id);

-- Фаза 9B: запити до служби підтримки. Гість також може написати адміністрації,
-- тому user_id і contact_email альтернативні — обов'язковий хоча б один.

CREATE TABLE support_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  contact_email VARCHAR(160),
  topic VARCHAR(32) NOT NULL DEFAULT 'other',
  message VARCHAR(2000) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'in_progress', 'closed')),
  resolution VARCHAR(1000) NOT NULL DEFAULT '',
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR contact_email IS NOT NULL)
);

CREATE INDEX support_requests_created_idx ON support_requests (created_at DESC);
CREATE INDEX support_requests_status_idx ON support_requests (status, created_at DESC);
CREATE INDEX support_requests_user_idx ON support_requests (user_id, created_at DESC);
