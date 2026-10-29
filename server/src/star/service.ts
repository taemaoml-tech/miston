import type { PoolClient } from 'pg';
import { query, withTransaction } from '../db/pool';
import { AppError, notFound } from '../utils/errors';
import { cosmeticsFrom } from '../utils/serializers';
import type {
  StarAchievementView,
  StarCategory,
  StarCosmetic,
  StarCosmetics,
  StarItemType,
  StarItemView,
  StarOverview,
  StarRarity,
  StarReward,
  StarUpdate,
  StarWallet,
} from '../types/domain';

export const STAR_REWARDS = {
  daily: 5,
  friend: 50,
  messageMilestone: 10,
  messageStep: 100,
  activityMilestone: 200,
  activityStep: 30,
} as const;

export const XP_REWARDS = {
  message: 10,
  daily: 20,
  friend: 50,
} as const;

const LEVEL_MAX = 50;

export function xpForLevel(level: number): number {
  const safe = Math.max(1, Math.min(LEVEL_MAX, Math.floor(level)));
  return 50 * safe * (safe - 1);
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (level < LEVEL_MAX && xp >= xpForLevel(level + 1)) level += 1;
  return level;
}

interface WalletRow {
  user_id: string;
  balance: number;
  xp: number;
  level: number;
  message_count: number;
  active_days: number;
  last_daily_claim: string | Date | null;
}

interface ItemRow {
  id: string;
  name: string;
  description: string;
  category: StarCategory;
  type: StarItemType;
  price: number;
  rarity: StarRarity;
  level_required: number;
  slot: string | null;
  icon: string;
  config: unknown;
  sort_order?: number;
  owned?: boolean;
  equipped?: boolean;
  acquired_at?: string | Date | null;
}

interface AchievementRow {
  id: string;
  name: string;
  description: string;
  icon: string;
  metric: 'messages' | 'active_days' | 'level';
  threshold: number;
  reward: number;
  rarity: StarRarity;
  unlocked_at: string | Date | null;
}

function isoDate(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function dayString(value: string | Date | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function configFrom(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? value as Record<string, unknown> : {};
}

async function currentDay(client: PoolClient): Promise<string> {
  const result = await client.query<{ today: string }>("SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS today");
  const today = result.rows[0]?.today;
  if (!today) throw new Error('Failed to resolve current date');
  return today;
}

async function serverToday(): Promise<string> {
  const result = await query<{ today: string }>("SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS today");
  const today = result.rows[0]?.today;
  if (!today) throw new Error('Failed to resolve current date');
  return today;
}

async function lockWallet(client: PoolClient, userId: string): Promise<WalletRow> {
  await client.query('INSERT INTO user_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
  const result = await client.query<WalletRow>('SELECT * FROM user_wallets WHERE user_id = $1 FOR UPDATE', [userId]);
  const row = result.rows[0];
  if (!row) throw new Error('Wallet not found');
  return row;
}

async function loadWallet(client: PoolClient, userId: string): Promise<WalletRow> {
  const result = await client.query<WalletRow>('SELECT * FROM user_wallets WHERE user_id = $1', [userId]);
  const row = result.rows[0];
  if (!row) throw new Error('Wallet not found');
  return row;
}

async function syncLevel(client: PoolClient, wallet: WalletRow): Promise<void> {
  const next = levelFromXp(Number(wallet.xp));
  if (next !== Number(wallet.level)) {
    await client.query('UPDATE user_wallets SET level = $2, updated_at = now() WHERE user_id = $1', [wallet.user_id, next]);
    wallet.level = next;
  }
}

async function registerActivity(client: PoolClient, userId: string, today: string): Promise<{ isNew: boolean; activeDays: number }> {
  const inserted = await client.query<{ active_days: number }>(
    `WITH new_day AS (
       INSERT INTO user_activity_days (user_id, day) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING 1
     )
     UPDATE user_wallets
     SET active_days = active_days + 1, updated_at = now()
     WHERE user_id = $1 AND EXISTS (SELECT 1 FROM new_day)
     RETURNING active_days`,
    [userId, today],
  );
  if (inserted.rows[0]) return { isNew: true, activeDays: Number(inserted.rows[0].active_days) };
  const current = await client.query<{ active_days: number }>(
    'SELECT active_days FROM user_wallets WHERE user_id = $1', [userId],
  );
  return { isNew: false, activeDays: Number(current.rows[0]?.active_days ?? 0) };
}

async function grantStars(
  client: PoolClient,
  userId: string,
  amount: number,
  reason: string,
  description: string,
  dedupeKey: string | null = null,
  meta: Record<string, unknown> = {},
): Promise<StarReward | null> {
  if (dedupeKey) {
    const existing = await client.query(
      'SELECT 1 FROM star_transactions WHERE user_id = $1 AND dedupe_key = $2 LIMIT 1', [userId, dedupeKey],
    );
    if (existing.rowCount) return null;
  }
  const updated = await client.query<{ balance: number }>(
    'UPDATE user_wallets SET balance = balance + $2, updated_at = now() WHERE user_id = $1 RETURNING balance',
    [userId, amount],
  );
  const row = updated.rows[0];
  if (!row) throw new Error('Wallet not found');
  const balanceAfter = Number(row.balance);
  const inserted = await client.query<{ id: string; created_at: Date | string }>(
    `INSERT INTO star_transactions (user_id, amount, reason, description, balance_after, dedupe_key, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, created_at`,
    [userId, amount, reason, description, balanceAfter, dedupeKey, JSON.stringify(meta)],
  );
  const created = inserted.rows[0];
  return {
    id: String(created?.id ?? ''),
    amount,
    reason,
    description,
    balanceAfter,
    createdAt: isoDate(created?.created_at ?? new Date()),
  };
}

function metricValue(metric: AchievementRow['metric'], wallet: WalletRow): number {
  if (metric === 'messages') return Number(wallet.message_count);
  if (metric === 'active_days') return Number(wallet.active_days);
  return Number(wallet.level);
}

function achievementView(row: AchievementRow, wallet: WalletRow): StarAchievementView {
  const current = metricValue(row.metric, wallet);
  const threshold = Number(row.threshold);
  const unlocked = row.unlocked_at != null;
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description),
    icon: String(row.icon),
    metric: row.metric,
    threshold,
    reward: Number(row.reward),
    rarity: row.rarity,
    current,
    progress: unlocked ? 100 : Math.min(100, Math.round((current / threshold) * 100)),
    unlocked,
    unlockedAt: row.unlocked_at == null ? null : isoDate(row.unlocked_at),
  };
}

async function evaluateAchievements(
  client: PoolClient,
  userId: string,
  wallet: WalletRow,
): Promise<{ unlocked: StarAchievementView[]; rewards: StarReward[] }> {
  const result = await client.query<AchievementRow>(
    `SELECT a.*, ua.unlocked_at
     FROM star_achievements a
     LEFT JOIN user_achievements ua ON ua.user_id = $1 AND ua.achievement_id = a.id
     ORDER BY a.sort_order ASC`,
    [userId],
  );
  const unlocked: StarAchievementView[] = [];
  const rewards: StarReward[] = [];
  for (const row of result.rows) {
    if (row.unlocked_at != null) continue;
    if (metricValue(row.metric, wallet) < Number(row.threshold)) continue;
    const inserted = await client.query<{ unlocked_at: string | Date }>(
      `INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING unlocked_at`,
      [userId, row.id],
    );
    if (!inserted.rowCount) continue;
    if (Number(row.reward) > 0) {
      const reward = await grantStars(
        client,
        userId,
        Number(row.reward),
        'achievement',
        `Досягнення «${row.name}»`,
        `achievement:${row.id}`,
        { achievementId: row.id },
      );
      if (reward) rewards.push(reward);
    }
    unlocked.push({
      ...achievementView(row, wallet),
      unlocked: true,
      progress: 100,
      unlockedAt: isoDate(inserted.rows[0]?.unlocked_at ?? new Date()),
    });
  }
  return { unlocked, rewards };
}

function walletView(row: WalletRow, today: string): StarWallet {
  const xp = Number(row.xp);
  const level = Number(row.level);
  const currentLevelXp = xpForLevel(level);
  const maxLevel = level >= LEVEL_MAX;
  const nextLevelXp = maxLevel ? currentLevelXp : xpForLevel(level + 1);
  const span = nextLevelXp - currentLevelXp;
  const xpIntoLevel = Math.max(0, xp - currentLevelXp);
  const claimedToday = dayString(row.last_daily_claim) === today;
  return {
    balance: Number(row.balance),
    xp,
    level,
    messageCount: Number(row.message_count),
    activeDays: Number(row.active_days),
    lastDailyClaim: dayString(row.last_daily_claim),
    levelProgress: {
      level,
      currentLevelXp,
      nextLevelXp,
      xpIntoLevel,
      xpForNext: maxLevel ? 0 : Math.max(0, nextLevelXp - xp),
      percent: maxLevel ? 100 : span <= 0 ? 100 : Math.min(100, Math.round((xpIntoLevel / span) * 100)),
      maxLevel,
    },
    daily: {
      reward: STAR_REWARDS.daily,
      canClaim: !claimedToday,
      claimedToday,
    },
  };
}

function itemView(row: ItemRow, wallet: WalletRow): StarItemView {
  const levelRequired = Number(row.level_required);
  const price = Number(row.price);
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description),
    category: row.category,
    type: row.type,
    price,
    rarity: row.rarity,
    levelRequired,
    slot: row.slot == null ? null : String(row.slot),
    icon: String(row.icon),
    config: configFrom(row.config),
    owned: Boolean(row.owned),
    equipped: Boolean(row.equipped),
    levelLocked: Number(wallet.level) < levelRequired,
    canAfford: Number(wallet.balance) >= price,
    acquiredAt: row.acquired_at == null ? null : isoDate(row.acquired_at),
  };
}

async function rebuildCosmetics(client: PoolClient, userId: string): Promise<StarCosmetics> {
  const result = await client.query<{ id: string; name: string; icon: string; type: StarItemType; slot: string; config: unknown }>(
    `SELECT i.id, i.name, i.icon, i.type, i.slot, i.config
     FROM user_inventory inv
     JOIN shop_items i ON i.id = inv.item_id
     WHERE inv.user_id = $1 AND inv.equipped AND i.slot IS NOT NULL`,
    [userId],
  );
  const cosmetics: StarCosmetics = {};
  for (const row of result.rows) {
    const cosmetic: StarCosmetic = {
      itemId: String(row.id),
      name: String(row.name),
      icon: String(row.icon),
      type: row.type,
      config: configFrom(row.config),
    };
    cosmetics[String(row.slot)] = cosmetic;
  }
  await client.query('UPDATE users SET cosmetics = $2::jsonb, updated_at = now() WHERE id = $1', [userId, JSON.stringify(cosmetics)]);
  return cosmetics;
}

export async function recordMessageReward(userId: string): Promise<StarUpdate> {
  const result = await withTransaction(async (client) => {
    const wallet = await lockWallet(client, userId);
    const today = await currentDay(client);
    const activity = await registerActivity(client, userId, today);
    const messageCount = Number(wallet.message_count) + 1;
    const xp = Number(wallet.xp) + XP_REWARDS.message;
    await client.query(
      'UPDATE user_wallets SET message_count = $2, xp = $3, updated_at = now() WHERE user_id = $1',
      [userId, messageCount, xp],
    );
    wallet.message_count = messageCount;
    wallet.xp = xp;
    wallet.active_days = activity.activeDays;
    await syncLevel(client, wallet);

    const rewards: StarReward[] = [];
    if (messageCount % STAR_REWARDS.messageStep === 0) {
      const reward = await grantStars(
        client, userId, STAR_REWARDS.messageMilestone, 'messages',
        `${messageCount} повідомлень у Miston`,
        `messages:${messageCount / STAR_REWARDS.messageStep}`,
        { messageCount },
      );
      if (reward) rewards.push(reward);
    }
    if (activity.isNew && activity.activeDays % STAR_REWARDS.activityStep === 0) {
      const reward = await grantStars(
        client, userId, STAR_REWARDS.activityMilestone, 'activity',
        `${activity.activeDays} днів активності`,
        `activity:${activity.activeDays}`,
        { activeDays: activity.activeDays },
      );
      if (reward) rewards.push(reward);
    }
    const achievements = await evaluateAchievements(client, userId, wallet);
    const fresh = await loadWallet(client, userId);
    return {
      wallet: walletView(fresh, today),
      rewards: [...rewards, ...achievements.rewards],
      achievements: achievements.unlocked,
    };
  });
  return result;
}

export async function claimDailyReward(userId: string): Promise<StarUpdate & { claimed: boolean }> {
  return withTransaction(async (client) => {
    const wallet = await lockWallet(client, userId);
    const today = await currentDay(client);
    if (dayString(wallet.last_daily_claim) === today) {
      return { claimed: false, wallet: walletView(wallet, today), rewards: [], achievements: [] };
    }
    const activity = await registerActivity(client, userId, today);
    const xp = Number(wallet.xp) + XP_REWARDS.daily;
    await client.query(
      'UPDATE user_wallets SET xp = $2, last_daily_claim = $3, updated_at = now() WHERE user_id = $1',
      [userId, xp, today],
    );
    wallet.xp = xp;
    wallet.last_daily_claim = today;
    wallet.active_days = activity.activeDays;
    await syncLevel(client, wallet);

    const rewards: StarReward[] = [];
    const daily = await grantStars(
      client, userId, STAR_REWARDS.daily, 'daily', 'Щоденна нагорода за вхід', `daily:${today}`, { day: today },
    );
    if (daily) rewards.push(daily);
    if (activity.isNew && activity.activeDays % STAR_REWARDS.activityStep === 0) {
      const reward = await grantStars(
        client, userId, STAR_REWARDS.activityMilestone, 'activity',
        `${activity.activeDays} днів активності`,
        `activity:${activity.activeDays}`,
        { activeDays: activity.activeDays },
      );
      if (reward) rewards.push(reward);
    }
    const achievements = await evaluateAchievements(client, userId, wallet);
    const fresh = await loadWallet(client, userId);
    return {
      claimed: true,
      wallet: walletView(fresh, today),
      rewards: [...rewards, ...achievements.rewards],
      achievements: achievements.unlocked,
    };
  });
}

export async function rewardFriendInvite(requesterId: string, friendId: string): Promise<StarUpdate | null> {
  return withTransaction(async (client) => {
    const wallet = await lockWallet(client, requesterId);
    const today = await currentDay(client);
    const reward = await grantStars(
      client, requesterId, STAR_REWARDS.friend, 'friend', 'Запрошеного друга прийнято',
      `friend:${friendId}`, { friendId },
    );
    if (!reward) return null;
    const activity = await registerActivity(client, requesterId, today);
    const xp = Number(wallet.xp) + XP_REWARDS.friend;
    await client.query('UPDATE user_wallets SET xp = $2, updated_at = now() WHERE user_id = $1', [requesterId, xp]);
    wallet.xp = xp;
    wallet.active_days = activity.activeDays;
    await syncLevel(client, wallet);

    const rewards: StarReward[] = [reward];
    if (activity.isNew && activity.activeDays % STAR_REWARDS.activityStep === 0) {
      const activityReward = await grantStars(
        client, requesterId, STAR_REWARDS.activityMilestone, 'activity',
        `${activity.activeDays} днів активності`,
        `activity:${activity.activeDays}`,
        { activeDays: activity.activeDays },
      );
      if (activityReward) rewards.push(activityReward);
    }
    const achievements = await evaluateAchievements(client, requesterId, wallet);
    const fresh = await loadWallet(client, requesterId);
    return {
      wallet: walletView(fresh, today),
      rewards: [...rewards, ...achievements.rewards],
      achievements: achievements.unlocked,
    };
  });
}

export async function getStarOverview(userId: string): Promise<StarOverview> {
  await query('INSERT INTO user_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
  const today = await serverToday();
  const [walletResult, userResult, achievementsResult, transactionsResult, statsResult] = await Promise.all([
    query<WalletRow>('SELECT * FROM user_wallets WHERE user_id = $1', [userId]),
    query<{ cosmetics: unknown }>('SELECT cosmetics FROM users WHERE id = $1', [userId]),
    query<AchievementRow>(
      `SELECT a.*, ua.unlocked_at
       FROM star_achievements a
       LEFT JOIN user_achievements ua ON ua.user_id = $1 AND ua.achievement_id = a.id
       ORDER BY a.sort_order ASC`,
      [userId],
    ),
    query<{ id: string; amount: number; reason: string; description: string; balance_after: number; created_at: Date | string }>(
      `SELECT id, amount, reason, description, balance_after, created_at
       FROM star_transactions WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 12`,
      [userId],
    ),
    query<{ catalog: number; owned: number }>(
      `SELECT (SELECT COUNT(*) FROM shop_items WHERE active)::int AS catalog,
              (SELECT COUNT(*) FROM user_inventory WHERE user_id = $1)::int AS owned`,
      [userId],
    ),
  ]);
  const wallet = walletResult.rows[0];
  if (!wallet) throw new Error('Wallet not found');
  const achievements = achievementsResult.rows.map((row) => achievementView(row, wallet));
  const stats = statsResult.rows[0];
  return {
    wallet: walletView(wallet, today),
    achievements,
    equipped: cosmeticsFrom(userResult.rows[0]?.cosmetics),
    recentTransactions: transactionsResult.rows.map((row) => ({
      id: String(row.id),
      amount: Number(row.amount),
      reason: String(row.reason),
      description: String(row.description),
      balanceAfter: Number(row.balance_after),
      createdAt: isoDate(row.created_at),
    })),
    stats: {
      catalog: Number(stats?.catalog ?? 0),
      owned: Number(stats?.owned ?? 0),
      unlockedAchievements: achievements.filter((item) => item.unlocked).length,
      totalAchievements: achievements.length,
    },
  };
}

export interface ShopFilters {
  category?: StarCategory | undefined;
  q?: string | undefined;
  rarity?: StarRarity | undefined;
  sort?: 'recommended' | 'price-asc' | 'price-desc' | 'rarity' | 'new' | undefined;
}

const SORT_SQL: Record<NonNullable<ShopFilters['sort']>, string> = {
  recommended: 'i.sort_order ASC, i.price ASC',
  'price-asc': 'i.price ASC, i.sort_order ASC',
  'price-desc': 'i.price DESC, i.sort_order ASC',
  rarity: `CASE i.rarity WHEN 'legendary' THEN 0 WHEN 'epic' THEN 1 WHEN 'rare' THEN 2 WHEN 'seasonal' THEN 3 ELSE 4 END ASC, i.price DESC`,
  new: 'i.created_at DESC, i.sort_order ASC',
};

export async function listShop(userId: string, filters: ShopFilters): Promise<{
  items: StarItemView[];
  counts: Record<StarCategory, number>;
  wallet: StarWallet;
}> {
  await query('INSERT INTO user_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
  const today = await serverToday();
  const [walletResult, countsResult] = await Promise.all([
    query<WalletRow>('SELECT * FROM user_wallets WHERE user_id = $1', [userId]),
    query<{ category: StarCategory; count: number }>(
      'SELECT category, COUNT(*)::int AS count FROM shop_items WHERE active GROUP BY category',
    ),
  ]);
  const wallet = walletResult.rows[0];
  if (!wallet) throw new Error('Wallet not found');

  const values: unknown[] = [userId];
  const where = ['i.active'];
  if (filters.category) {
    values.push(filters.category);
    where.push(`i.category = $${values.length}::star_category`);
  }
  if (filters.rarity) {
    values.push(filters.rarity);
    where.push(`i.rarity = $${values.length}::star_rarity`);
  }
  if (filters.q) {
    values.push(`%${filters.q.replace(/[\\%_]/g, '\\$&')}%`);
    where.push(`(i.name ILIKE $${values.length} ESCAPE '\\' OR i.description ILIKE $${values.length} ESCAPE '\\')`);
  }
  const order = SORT_SQL[filters.sort ?? 'recommended'];
  const result = await query<ItemRow>(
    `SELECT i.*, inv.id IS NOT NULL AS owned, COALESCE(inv.equipped, false) AS equipped, inv.acquired_at
     FROM shop_items i
     LEFT JOIN user_inventory inv ON inv.item_id = i.id AND inv.user_id = $1
     WHERE ${where.join(' AND ')}
     ORDER BY ${order}`,
    values,
  );
  const counts: Record<StarCategory, number> = { profile: 0, chats: 0, emoji: 0, collections: 0 };
  for (const row of countsResult.rows) counts[row.category] = Number(row.count);
  return {
    items: result.rows.map((row) => itemView(row, wallet)),
    counts,
    wallet: walletView(wallet, today),
  };
}

export type InventorySort = 'recent' | 'price' | 'rarity' | 'name' | 'equipped';

const INVENTORY_SORT_SQL: Record<InventorySort, string> = {
  recent: 'inv.acquired_at DESC',
  price: 'i.price DESC, inv.acquired_at DESC',
  rarity: `CASE i.rarity WHEN 'legendary' THEN 0 WHEN 'epic' THEN 1 WHEN 'rare' THEN 2 WHEN 'seasonal' THEN 3 ELSE 4 END ASC`,
  name: 'i.name ASC',
  equipped: 'inv.equipped DESC, inv.acquired_at DESC',
};

export async function getInventory(userId: string, sort: InventorySort = 'recent'): Promise<{
  items: StarItemView[];
  wallet: StarWallet;
}> {
  await query('INSERT INTO user_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
  const today = await serverToday();
  const [walletResult, itemsResult] = await Promise.all([
    query<WalletRow>('SELECT * FROM user_wallets WHERE user_id = $1', [userId]),
    query<ItemRow>(
      `SELECT i.*, true AS owned, inv.equipped, inv.acquired_at
       FROM user_inventory inv
       JOIN shop_items i ON i.id = inv.item_id
       WHERE inv.user_id = $1
       ORDER BY ${INVENTORY_SORT_SQL[sort] ?? INVENTORY_SORT_SQL.recent}`,
      [userId],
    ),
  ]);
  const wallet = walletResult.rows[0];
  if (!wallet) throw new Error('Wallet not found');
  return { items: itemsResult.rows.map((row) => itemView(row, wallet)), wallet: walletView(wallet, today) };
}

export async function purchaseItem(userId: string, itemId: string): Promise<StarUpdate & { item: StarItemView; equipped: StarCosmetics }> {
  return withTransaction(async (client) => {
    const itemResult = await client.query<ItemRow>('SELECT * FROM shop_items WHERE id = $1 AND active', [itemId]);
    const item = itemResult.rows[0];
    if (!item) throw notFound('Товар не знайдено');
    const wallet = await lockWallet(client, userId);
    if (Number(wallet.level) < Number(item.level_required)) {
      throw new AppError(403, 'LEVEL_REQUIRED', `Потрібен ${item.level_required} рівень профілю, щоб купити цей товар`);
    }
    const owned = await client.query('SELECT 1 FROM user_inventory WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
    if (owned.rowCount) throw new AppError(409, 'ALREADY_OWNED', 'Цей товар уже є у вашому інвентарі');
    if (Number(wallet.balance) < Number(item.price)) {
      throw new AppError(400, 'INSUFFICIENT_STARS', 'Недостатньо зірок. Заробляйте їх за активність у Miston');
    }

    const balanceAfter = Number(wallet.balance) - Number(item.price);
    await client.query('UPDATE user_wallets SET balance = $2, updated_at = now() WHERE user_id = $1', [userId, balanceAfter]);
    const inserted = await client.query<{ id: string; acquired_at: string | Date }>(
      `INSERT INTO user_inventory (user_id, item_id, slot) VALUES ($1, $2, $3)
       RETURNING id, acquired_at`,
      [userId, itemId, item.slot],
    );
    await client.query(
      `INSERT INTO star_transactions (user_id, amount, reason, description, balance_after, meta)
       VALUES ($1, $2, 'purchase', $3, $4, $5)`,
      [userId, -Number(item.price), `Покупка «${item.name}»`, balanceAfter, JSON.stringify({ itemId })],
    );

    let equipped = Boolean(item.slot);
    if (item.slot) {
      const busy = await client.query(
        'SELECT 1 FROM user_inventory WHERE user_id = $1 AND slot = $2 AND equipped AND item_id <> $3',
        [userId, item.slot, itemId],
      );
      equipped = busy.rowCount === 0;
      if (equipped) {
        await client.query('UPDATE user_inventory SET equipped = true WHERE id = $1', [inserted.rows[0]?.id]);
      }
    }
    const cosmetics = await rebuildCosmetics(client, userId);
    const fresh = await loadWallet(client, userId);
    const today = await currentDay(client);
    const updatedItem = await client.query<ItemRow>(
      `SELECT i.*, true AS owned, inv.equipped, inv.acquired_at
       FROM user_inventory inv JOIN shop_items i ON i.id = inv.item_id
       WHERE inv.user_id = $1 AND inv.item_id = $2`,
      [userId, itemId],
    );
    return {
      wallet: walletView(fresh, today),
      rewards: [],
      achievements: [],
      item: itemView(updatedItem.rows[0] ?? { ...item, owned: true, equipped, acquired_at: inserted.rows[0]?.acquired_at ?? null }, fresh),
      equipped: cosmetics,
    };
  });
}

/**
 * Зміна балансу особою з правами star.manage. Додатні суми — нарахування,
 * від'ємні — списання; списати більше, ніж є, не можна.
 */
export async function adminAdjustStars(
  userId: string,
  amount: number,
  description: string,
  meta: Record<string, unknown> = {},
): Promise<StarReward> {
  return withTransaction(async (client) => {
    const wallet = await lockWallet(client, userId);
    const balance = Number(wallet.balance);
    if (amount < 0 && balance + amount < 0) {
      throw new AppError(
        400,
        'STAR_BALANCE_TOO_LOW',
        `На рахунку лише ${balance} Star — забрати ${Math.abs(amount)} неможливо`,
        { balance },
      );
    }
    const reward = await grantStars(
      client, userId, amount, amount >= 0 ? 'admin_grant' : 'admin_remove', description, null, meta,
    );
    if (!reward) throw new Error('Не вдалося змінити баланс Star');
    return reward;
  });
}

export async function equipItem(userId: string, itemId: string): Promise<{ equipped: StarCosmetics }> {
  return withTransaction(async (client) => {
    const itemResult = await client.query<ItemRow & { inventory_id: string }>(
      `SELECT i.*, inv.id AS inventory_id, inv.equipped, inv.acquired_at
       FROM user_inventory inv JOIN shop_items i ON i.id = inv.item_id
       WHERE inv.user_id = $1 AND inv.item_id = $2`,
      [userId, itemId],
    );
    const item = itemResult.rows[0];
    if (!item) throw notFound('Предмет не знайдено в інвентарі');
    if (!item.slot) throw new AppError(400, 'NOT_EQUIPPABLE', 'Цей предмет не можна екіпірувати');
    await client.query('UPDATE user_inventory SET equipped = false WHERE user_id = $1 AND slot = $2 AND equipped', [userId, item.slot]);
    await client.query('UPDATE user_inventory SET equipped = true WHERE id = $1', [item.inventory_id]);
    return { equipped: await rebuildCosmetics(client, userId) };
  });
}

export async function unequipItem(userId: string, itemId: string): Promise<{ equipped: StarCosmetics }> {
  return withTransaction(async (client) => {
    const itemResult = await client.query<{ inventory_id: string }>(
      'SELECT id AS inventory_id FROM user_inventory WHERE user_id = $1 AND item_id = $2',
      [userId, itemId],
    );
    const item = itemResult.rows[0];
    if (!item) throw notFound('Предмет не знайдено в інвентарі');
    await client.query('UPDATE user_inventory SET equipped = false WHERE id = $1', [item.inventory_id]);
    return { equipped: await rebuildCosmetics(client, userId) };
  });
}
