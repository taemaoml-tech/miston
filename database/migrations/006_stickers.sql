-- Фаза 6: стікери — набори, окремі стікери, улюблені та недавні.

ALTER TYPE message_kind ADD VALUE IF NOT EXISTS 'sticker';

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

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS sticker_id UUID REFERENCES stickers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS messages_sticker_idx ON messages (sticker_id) WHERE sticker_id IS NOT NULL;

-- Текстові повідомлення вимагають текст. Стікер — або посилання на стікер, або
-- знімок його назви: видалення стікера із БД залишає в історії «гробову плиту».
ALTER TABLE messages DROP CONSTRAINT IF EXISTS message_payload;
ALTER TABLE messages ADD CONSTRAINT message_payload CHECK (
  (kind = 'text' AND length(trim(content)) > 0)
  OR (kind = 'sticker' AND (sticker_id IS NOT NULL OR length(trim(content)) > 0))
  OR (kind <> 'text' AND kind <> 'sticker')
);
