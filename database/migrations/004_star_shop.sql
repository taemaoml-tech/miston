-- Star shop: internal currency, XP levels, cosmetics, inventory and achievements.

ALTER TABLE users ADD COLUMN IF NOT EXISTS cosmetics JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TYPE star_category AS ENUM ('profile', 'chats', 'emoji', 'collections');
CREATE TYPE star_rarity AS ENUM ('common', 'rare', 'epic', 'legendary', 'seasonal');
CREATE TYPE star_item_type AS ENUM (
  'profile_frame', 'nickname_color', 'avatar_effect', 'profile_background', 'badge',
  'chat_background', 'theme', 'message_effect', 'notification_sound',
  'emoji_pack', 'sticker_pack', 'collection'
);

CREATE TABLE user_wallets (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  message_count INTEGER NOT NULL DEFAULT 0 CHECK (message_count >= 0),
  active_days INTEGER NOT NULL DEFAULT 0 CHECK (active_days >= 0),
  last_daily_claim DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_activity_days (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

CREATE TABLE shop_items (
  id TEXT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(240) NOT NULL DEFAULT '',
  category star_category NOT NULL,
  type star_item_type NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 0),
  rarity star_rarity NOT NULL DEFAULT 'common',
  level_required INTEGER NOT NULL DEFAULT 1 CHECK (level_required >= 1),
  slot TEXT,
  icon TEXT NOT NULL DEFAULT '✨',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE,
  slot TEXT,
  equipped BOOLEAN NOT NULL DEFAULT false,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);

CREATE TABLE star_transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  description VARCHAR(200) NOT NULL DEFAULT '',
  balance_after INTEGER NOT NULL,
  dedupe_key TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE star_achievements (
  id TEXT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(200) NOT NULL,
  icon TEXT NOT NULL DEFAULT '🏅',
  metric TEXT NOT NULL CHECK (metric IN ('messages', 'active_days', 'level')),
  threshold INTEGER NOT NULL CHECK (threshold > 0),
  reward INTEGER NOT NULL DEFAULT 0 CHECK (reward >= 0),
  rarity star_rarity NOT NULL DEFAULT 'common',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE user_achievements (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES star_achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE UNIQUE INDEX user_inventory_equipped_slot_idx
  ON user_inventory (user_id, slot) WHERE equipped AND slot IS NOT NULL;
CREATE INDEX user_inventory_user_idx ON user_inventory (user_id, acquired_at DESC);
CREATE INDEX shop_items_category_idx ON shop_items (category, sort_order) WHERE active;
CREATE INDEX star_transactions_user_idx ON star_transactions (user_id, created_at DESC);
CREATE UNIQUE INDEX star_transactions_dedupe_idx
  ON star_transactions (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX user_activity_days_user_idx ON user_activity_days (user_id, day DESC);

INSERT INTO user_wallets (user_id) SELECT id FROM users ON CONFLICT DO NOTHING;

INSERT INTO shop_items (id, name, description, category, type, price, rarity, level_required, slot, icon, config, sort_order) VALUES
  ('frame-blue', 'Синє сяйво', 'Класична синя рамка з м''яким світінням навколо аватара.', 'profile', 'profile_frame', 100, 'common', 1, 'frame', '🔵', '{"gradient":["#60a5fa","#2563eb"],"glow":"#3b82f6"}', 10),
  ('frame-red', 'Багряний контур', 'Насичена червона рамка для тих, хто не губиться в натовпі.', 'profile', 'profile_frame', 150, 'common', 1, 'frame', '🔴', '{"gradient":["#fb7185","#dc2626"],"glow":"#ef4444"}', 20),
  ('frame-emerald', 'Смарагдовий', 'Рамка з глибоким зеленим градієнтом і легким пульсом.', 'profile', 'profile_frame', 200, 'rare', 2, 'frame', '🟢', '{"gradient":["#34d399","#059669"],"glow":"#10b981"}', 30),
  ('frame-gold', 'Золота легенда', 'Анімована золота рамка для найпомітніших профілів.', 'profile', 'profile_frame', 1000, 'legendary', 5, 'frame', '🏆', '{"gradient":["#fde047","#f59e0b","#b45309"],"glow":"#f59e0b","animated":true}', 40),
  ('nick-violet', 'Фіолетовий нік', 'Спокійний фіолетовий колір вашого імені в чатах.', 'profile', 'nickname_color', 180, 'common', 1, 'nickname', '🟣', '{"color":"#8b5cf6"}', 50),
  ('nick-neon', 'Неоновий нік', 'Яскравий бірюзовий нік із неоновим світінням.', 'profile', 'nickname_color', 350, 'rare', 2, 'nickname', '💠', '{"color":"#22d3ee","glow":"#06b6d4"}', 60),
  ('nick-gold', 'Золотий нік', 'Легендарне золоте ім''я з переливом.', 'profile', 'nickname_color', 1000, 'legendary', 5, 'nickname', '👑', '{"color":"#f59e0b","gradient":["#fde047","#f59e0b","#b45309"],"animated":true}', 70),
  ('avatar-pulse', 'Пульс', 'Аватар пульсує фіолетовим ореолом.', 'profile', 'avatar_effect', 500, 'epic', 3, 'avatar_effect', '💜', '{"effect":"pulse","color":"#a855f7"}', 80),
  ('avatar-orbit', 'Орбіта', 'Навколо аватара обертається світна орбіта.', 'profile', 'avatar_effect', 700, 'epic', 4, 'avatar_effect', '🪐', '{"effect":"orbit","color":"#38bdf8"}', 90),
  ('profile-bg-cosmos', 'Космічний фон', 'Глибокий космічний градієнт для шапки профілю.', 'profile', 'profile_background', 400, 'rare', 1, 'profile_background', '🌌', '{"gradient":["#0f172a","#4c1d95","#0ea5e9"]}', 100),
  ('profile-bg-aurora', 'Полярне сяйво', 'Аврора з зелених і фіолетових хвиль.', 'profile', 'profile_background', 450, 'rare', 2, 'profile_background', '🌠', '{"gradient":["#022c22","#059669","#7c3aed"]}', 110),
  ('badge-star', 'Знавець зірок', 'Значок зірки поруч із вашим ім''ям.', 'profile', 'badge', 250, 'rare', 1, 'badge', '⭐', '{"emoji":"⭐","label":"Знавець зірок"}', 120),
  ('badge-flame', 'Вогняна душа', 'Полум''я для активних учасників розмов.', 'profile', 'badge', 300, 'epic', 3, 'badge', '🔥', '{"emoji":"🔥","label":"Вогняна душа"}', 130),
  ('badge-crown', 'Корона', 'Значок лідера спільноти.', 'profile', 'badge', 800, 'legendary', 4, 'badge', '👑', '{"emoji":"👑","label":"Корона"}', 140),

  ('theme-cosmos', 'Космос', 'Фіолетова тема інтерфейсу з космічним настроєм.', 'chats', 'theme', 300, 'rare', 2, 'theme', '🌌', '{"label":"Космос","palette":["#f5f3ff","#ede9fe","#ddd6fe","#c4b5fd","#a78bfa","#8b5cf6","#7c3aed","#6d28d9","#5b21b6","#4c1d95","#2e1065"],"backdrop":"radial-gradient(circle at 18% 12%, rgba(139,92,246,.18), transparent 34%), radial-gradient(circle at 82% 88%, rgba(14,165,233,.14), transparent 36%)"}', 150),
  ('theme-neon', 'Неон', 'Бірюзова неонова тема для яскравих чатів.', 'chats', 'theme', 300, 'rare', 2, 'theme', '💠', '{"label":"Неон","palette":["#ecfeff","#cffafe","#a5f3fc","#67e8f9","#22d3ee","#06b6d4","#0891b2","#0e7490","#155e75","#164e63","#083344"],"backdrop":"radial-gradient(circle at 16% 14%, rgba(34,211,238,.2), transparent 34%), radial-gradient(circle at 86% 82%, rgba(59,130,246,.16), transparent 36%)"}', 160),
  ('theme-forest', 'Ліс', 'Смарагдова тема з природним настроєм.', 'chats', 'theme', 250, 'common', 1, 'theme', '🌲', '{"label":"Ліс","palette":["#ecfdf5","#d1fae5","#a7f3d0","#6ee7b7","#34d399","#10b981","#059669","#047857","#065f46","#064e3b","#022c22"],"backdrop":"radial-gradient(circle at 18% 12%, rgba(16,185,129,.16), transparent 34%), radial-gradient(circle at 84% 86%, rgba(52,211,153,.12), transparent 36%)"}', 170),
  ('chatbg-stars', 'Зоряне небо', 'Фон чату із зорями та глибоким синім градієнтом.', 'chats', 'chat_background', 200, 'rare', 1, 'chat_background', '✨', '{"light":"radial-gradient(circle at 20% 20%, #dbeafe, transparent 34%), radial-gradient(circle at 80% 80%, #ede9fe, transparent 32%)","dark":"radial-gradient(circle at 18% 16%, #1e3a8a55, transparent 34%), radial-gradient(circle at 82% 84%, #4c1d9555, transparent 34%)","pattern":"stars"}', 180),
  ('chatbg-sunset', 'Захід сонця', 'Теплий градієнт від помаранчевого до рожевого.', 'chats', 'chat_background', 180, 'common', 1, 'chat_background', '🌇', '{"light":"radial-gradient(circle at 15% 20%, #fed7aa, transparent 36%), radial-gradient(circle at 85% 80%, #fbcfe8, transparent 36%)","dark":"radial-gradient(circle at 15% 20%, #c2410c44, transparent 36%), radial-gradient(circle at 85% 80%, #9d174d44, transparent 36%)"}', 190),
  ('effect-confetti', 'Конфеті', 'Вибух конфеті під час надсилання повідомлення.', 'chats', 'message_effect', 250, 'rare', 1, 'message_effect', '🎉', '{"effect":"confetti","colors":["#f472b6","#facc15","#38bdf8","#34d399"]}', 200),
  ('effect-fireworks', 'Феєрверк', 'Іскри та феєрверк для ваших повідомлень.', 'chats', 'message_effect', 350, 'epic', 2, 'message_effect', '🎆', '{"effect":"fireworks","colors":["#fbbf24","#fb7185","#a78bfa"]}', 210),
  ('sound-chime', 'Дзвіночок', 'М''який дзвін для нових повідомлень.', 'chats', 'notification_sound', 150, 'common', 1, 'sound', '🔔', '{"sound":"chime","notes":[880,1174.66]}', 220),
  ('sound-pop', 'Поп', 'Короткий веселий звук сповіщення.', 'chats', 'notification_sound', 120, 'common', 1, 'sound', '🫧', '{"sound":"pop","notes":[523.25,659.25]}', 230),

  ('emoji-exclusive', 'Ексклюзивні емодзі', 'Набір емодзі, доступний лише в Miston.', 'emoji', 'emoji_pack', 150, 'common', 1, NULL, '😎', '{"emojis":["🚀","🪐","⭐","🌌","🛸","👾","🫡","🤖","💫","🌠"]}', 240),
  ('emoji-animated', 'Анімовані емодзі', 'Добірка анімованих емодзі для живих реакцій.', 'emoji', 'emoji_pack', 300, 'rare', 2, NULL, '✨', '{"animated":true,"emojis":["🎇","💥","🫨","🌀","⚡","🌈"]}', 250),
  ('stickers-miston', 'Стикерпак Miston', 'Фірмові стікери для будь-якої розмови.', 'emoji', 'sticker_pack', 200, 'rare', 1, NULL, '🐱', '{"stickers":[{"emoji":"🐱","label":"Мурчик"},{"emoji":"🐶","label":"Дружбан"},{"emoji":"🦊","label":"Хитрун"},{"emoji":"🐼","label":"Спокій"},{"emoji":"🦄","label":"Мрія"},{"emoji":"🐸","label":"Веселун"}]}', 260),
  ('stickers-space', 'Космічні стикери', 'Стікери про подорожі зірками.', 'emoji', 'sticker_pack', 250, 'rare', 2, NULL, '🚀', '{"stickers":[{"emoji":"🚀","label":"Політ"},{"emoji":"🛸","label":"Таємниця"},{"emoji":"🪐","label":"Орбіта"},{"emoji":"👽","label":"Контакт"},{"emoji":"🌠","label":"Бажання"},{"emoji":"🌌","label":"Галактика"}]}', 270),

  ('collection-rare', 'Рідкісна колекція', 'Добірка рідкісних косметичних предметів для справжніх колекціонерів.', 'collections', 'collection', 800, 'epic', 3, NULL, '💎', '{"gradient":["#312e81","#7c3aed","#06b6d4"],"emojis":["💎","🔮","🗿","🧿","⚜️"]}', 280),
  ('collection-winter', 'Зимова колекція', 'Сезонна колекція зі сніжинками та крижаними відтінками.', 'collections', 'collection', 600, 'seasonal', 1, NULL, '❄️', '{"gradient":["#0c4a6e","#0ea5e9","#e0f2fe"],"emojis":["❄️","⛄","🧊","🎿","🌨️"]}', 290),
  ('collection-holiday', 'Святкова колекція', 'Святковий набір для теплих привітань.', 'collections', 'collection', 450, 'seasonal', 1, NULL, '🎄', '{"gradient":["#7f1d1d","#dc2626","#fbbf24"],"emojis":["🎄","🎁","🎅","🕯️","✨"]}', 300),
  ('collection-neon', 'Неонова колекція', 'Сяйні предмети для любителів неону.', 'collections', 'collection', 650, 'epic', 2, NULL, '🌈', '{"gradient":["#083344","#06b6d4","#a855f7"],"emojis":["💠","🪩","⚡","🔆","🌈"]}', 310)
ON CONFLICT (id) DO NOTHING;

INSERT INTO star_achievements (id, name, description, icon, metric, threshold, reward, rarity, sort_order) VALUES
  ('novice', 'Новачок', 'Надішліть 10 повідомлень і освоюйтесь у Miston.', '🌱', 'messages', 10, 25, 'common', 10),
  ('active-user', 'Активний користувач', 'Надішліть 100 повідомлень — ви вже свій.', '⚡', 'messages', 100, 75, 'rare', 20),
  ('veteran', 'Ветеран', 'Будьте активні 30 днів поспіль у Miston.', '🛡️', 'active_days', 30, 200, 'epic', 30),
  ('legend', 'Легенда', 'Досягніть 10 рівня профілю.', '🏆', 'level', 10, 500, 'legendary', 40)
ON CONFLICT (id) DO NOTHING;
