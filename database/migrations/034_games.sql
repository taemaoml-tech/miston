-- Фаза: командні ігри в чаті. Дані зберігаються окремими записами,
-- щоб історію можна було переглянути навіть після завершення гри.

ALTER TYPE message_kind ADD VALUE IF NOT EXISTS 'game';

CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('snake', 'dice', 'quiz')),
  status TEXT NOT NULL DEFAULT 'inviting' CHECK (status IN ('inviting', 'active', 'finished', 'cancelled', 'expired')),
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opponent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  winner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  CONSTRAINT game_players_distinct CHECK (creator_id <> opponent_id)
);

CREATE TABLE IF NOT EXISTS game_players (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  PRIMARY KEY (game_id, user_id)
);

CREATE TABLE IF NOT EXISTS game_moves (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS games_conversation_idx ON games (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS game_players_user_idx ON game_players (user_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS game_moves_game_idx ON game_moves (game_id, round, id);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS game_id UUID REFERENCES games(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS messages_game_idx ON messages (game_id) WHERE game_id IS NOT NULL;
