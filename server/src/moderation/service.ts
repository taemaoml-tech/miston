import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import { adminAdjustStars } from '../star/service';
import { assertCanManage } from '../auth/permissions';
import { recordAudit, recordAuditStandalone } from '../auth/audit';
import { config } from '../config/env';
import { query, withTransaction } from '../db/pool';
import { isUserOnline } from '../sockets/presence';
import { AppError, notFound } from '../utils/errors';
import { serializeSender } from '../utils/serializers';
import type { AdminActionLog, AuthContext, ModerationUser, StarReward, UserRole } from '../types/domain';

interface TargetRow extends Record<string, unknown> {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  is_verified: boolean;
  blocked_at: Date | null;
  blocked_until: Date | null;
  blocked_reason: string | null;
}

async function loadTarget(client: PoolClient, userId: string): Promise<TargetRow> {
  const result = await client.query<TargetRow>('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId]);
  const row = result.rows[0];
  if (!row) throw notFound('Користувача не знайдено');
  return row;
}

export interface BlockInput {
  reason: string;
  untilHours?: number | null | undefined;
}

export async function blockUser(actor: AuthContext, userId: string, input: BlockInput): Promise<ModerationUser> {
  return withTransaction(async (client) => {
    const target = await loadTarget(client, userId);
    assertCanManage(actor, userId, target.role);
    const until = input.untilHours == null ? null : new Date(Date.now() + input.untilHours * 3_600_000);
    await client.query(
      `UPDATE users
       SET blocked_at = now(), blocked_until = $2, blocked_reason = $3, blocked_by = $4, updated_at = now()
       WHERE id = $1`,
      [userId, until, input.reason, actor.userId],
    );
    // Нових токенів заблокований акаунт уже не отримає.
    await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
    await recordAudit(client, {
      action: 'user.block',
      actor,
      targetUserId: userId,
      details: { username: target.username, reason: input.reason, untilHours: input.untilHours ?? null },
    });
    return selectModerationUser(client, userId);
  });
}

export async function unblockUser(actor: AuthContext, userId: string): Promise<ModerationUser> {
  return withTransaction(async (client) => {
    const target = await loadTarget(client, userId);
    assertCanManage(actor, userId, target.role);
    if (!target.blocked_at) throw new AppError(409, 'NOT_BLOCKED', 'Цей акаунт не заблоковано');
    await client.query(
      `UPDATE users
       SET blocked_at = NULL, blocked_until = NULL, blocked_reason = '', blocked_by = NULL, updated_at = now()
       WHERE id = $1`,
      [userId],
    );
    await recordAudit(client, {
      action: 'user.unblock',
      actor,
      targetUserId: userId,
      details: { username: target.username },
    });
    return selectModerationUser(client, userId);
  });
}

export interface DeletedAccount {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
}

export async function deleteAccount(actor: AuthContext, userId: string): Promise<DeletedAccount> {
  return withTransaction(async (client) => {
    const target = await loadTarget(client, userId);
    assertCanManage(actor, userId, target.role);
    const snapshot: DeletedAccount = {
      id: userId,
      username: target.username,
      displayName: target.display_name,
      role: target.role,
    };
    // Запис у журнал — до видалення, інакше foreign key ON DELETE SET NULL
    // прибрав би з нього згадку про акаунт.
    await recordAudit(client, {
      action: 'user.delete',
      actor,
      targetUserId: null,
      targetId: userId,
      details: { ...snapshot },
    });
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    return snapshot;
  });
}

export async function setVerification(
  actor: AuthContext,
  userId: string,
  verified: boolean,
): Promise<ModerationUser> {
  return withTransaction(async (client) => {
    const target = await loadTarget(client, userId);
    assertCanManage(actor, userId, target.role);
    if (target.is_verified === verified) throw new AppError(409, 'VERIFICATION_UNCHANGED', 'Верифікація вже в такому стані');
    await client.query(
      `UPDATE users
       SET is_verified = $2::boolean,
           verified_at = CASE WHEN $2::boolean THEN now() ELSE NULL END,
           verified_by = CASE WHEN $2::boolean THEN $3::uuid ELSE NULL END,
           updated_at = now()
       WHERE id = $1`,
      [userId, verified, actor.userId],
    );
    await recordAudit(client, {
      action: verified ? 'user.verify' : 'user.unverify',
      actor,
      targetUserId: userId,
      details: { username: target.username },
    });
    return selectModerationUser(client, userId);
  });
}

export async function adjustStars(
  actor: AuthContext,
  userId: string,
  amount: number,
  description: string,
): Promise<StarReward> {
  const target = await query<TargetRow>('SELECT * FROM users WHERE id = $1', [userId]);
  const row = target.rows[0];
  if (!row) throw notFound('Користувача не знайдено');
  assertCanManage(actor, userId, row.role);
  const reward = await adminAdjustStars(userId, amount, description, { actorId: actor.userId, actorRole: actor.role });
  await recordAuditStandalone({
    action: amount >= 0 ? 'star.grant' : 'star.remove',
    actor,
    targetUserId: userId,
    targetId: reward.id,
    details: { amount, description, balanceAfter: reward.balanceAfter, username: row.username },
  });
  return reward;
}

export async function setStaffRole(actor: AuthContext, userId: string, role: UserRole): Promise<ModerationUser> {
  return withTransaction(async (client) => {
    const target = await loadTarget(client, userId);
    assertCanManage(actor, userId, target.role);
    if (role === 'owner') throw forbiddenOwnerGrant();
    if (target.role === role) throw new AppError(409, 'ROLE_UNCHANGED', 'Роль вже в такому стані');
    await client.query("UPDATE users SET role = $2::user_role, updated_at = now() WHERE id = $1", [userId, role]);
    await recordAudit(client, {
      action: role === 'moderator' ? 'role.grant' : 'role.revoke',
      actor,
      targetUserId: userId,
      details: { username: target.username, from: target.role, to: role },
    });
    return selectModerationUser(client, userId);
  });
}

function forbiddenOwnerGrant(): AppError {
  return new AppError(403, 'OWNER_GRANT_FORBIDDEN', 'Роль власника видає лише перший зареєстрований акаунт');
}

export interface NewStaffAccount {
  email: string;
  username: string;
  displayName: string;
  password: string;
}

export async function createStaffAccount(actor: AuthContext, input: NewStaffAccount): Promise<ModerationUser> {
  const passwordHash = await bcrypt.hash(input.password, config.BCRYPT_ROUNDS);
  return withTransaction(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO users (email, username, display_name, password_hash, role)
       VALUES ($1, $2, $3, $4, 'moderator') RETURNING id`,
      [input.email, input.username, input.displayName, passwordHash],
    );
    const userId = String(inserted.rows[0]?.id);
    await client.query('INSERT INTO user_wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
    await recordAudit(client, {
      action: 'role.grant',
      actor,
      targetUserId: userId,
      details: { username: input.username, created: true, role: 'moderator' },
    });
    return selectModerationUser(client, userId);
  });
}

const MODERATION_USER_SELECT = `
  SELECT u.id, u.username, u.display_name, u.avatar_url, u.email, u.role, u.is_verified,
         u.created_at, u.last_seen_at, u.blocked_at, u.blocked_until, u.blocked_reason,
         COALESCE(w.balance, 0)::int AS star_balance,
         COALESCE(w.message_count, 0)::int AS message_count
  FROM users u
  LEFT JOIN user_wallets w ON w.user_id = u.id`;

async function selectModerationUser(client: PoolClient, userId: string): Promise<ModerationUser> {
  const result = await client.query<Record<string, unknown>>(`${MODERATION_USER_SELECT} WHERE u.id = $1`, [userId]);
  const row = result.rows[0];
  if (!row) throw notFound('Користувача не знайдено');
  return mapModerationUser(row);
}

function mapModerationUser(row: Record<string, unknown>): ModerationUser {
  const date = (value: unknown): string | null => (value instanceof Date ? value.toISOString() : null);
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    avatarUrl: row.avatar_url == null ? null : String(row.avatar_url),
    email: String(row.email ?? ''),
    role: row.role as UserRole,
    isVerified: Boolean(row.is_verified),
    starBalance: Number(row.star_balance ?? 0),
    messageCount: Number(row.message_count ?? 0),
    createdAt: date(row.created_at) ?? '',
    lastSeenAt: date(row.last_seen_at) ?? '',
    online: isUserOnline(String(row.id)),
    blockedAt: date(row.blocked_at),
    blockedUntil: date(row.blocked_until),
    blockedReason: String(row.blocked_reason ?? ''),
  };
}

export interface UserListFilters {
  q?: string | undefined;
  role?: UserRole | undefined;
  status?: 'all' | 'online' | 'blocked' | 'verified';
  limit: number;
  offset: number;
}

export async function listModerationUsers(filters: UserListFilters): Promise<{ users: ModerationUser[]; total: number }> {
  const values: unknown[] = [];
  const where: string[] = [];
  if (filters.q) {
    values.push(`%${filters.q.replace(/[\\%_]/g, '\\$&')}%`);
    const placeholder = `$${values.length}`;
    where.push(`(u.username ILIKE ${placeholder} ESCAPE '\\' OR u.display_name ILIKE ${placeholder} ESCAPE '\\' OR u.email ILIKE ${placeholder} ESCAPE '\\')`);
  }
  if (filters.role) {
    values.push(filters.role);
    where.push(`u.role = $${values.length}::user_role`);
  }
  if (filters.status === 'online') where.push('u.last_seen_at > now() - interval \'5 minutes\'');
  if (filters.status === 'blocked') where.push('u.blocked_at IS NOT NULL AND (u.blocked_until IS NULL OR u.blocked_until > now())');
  if (filters.status === 'verified') where.push('u.is_verified');

  const clause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
  const countResult = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM users u${clause}`,
    values,
  );
  values.push(filters.limit, filters.offset);
  const rows = await query<Record<string, unknown>>(
    `${MODERATION_USER_SELECT}${clause}
     ORDER BY u.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  return { users: rows.rows.map(mapModerationUser), total: Number(countResult.rows[0]?.count ?? 0) };
}

export interface PlatformStats {
  users: { total: number; online: number; blocked: number; verified: number; moderators: number };
  content: { messages: number; conversations: number; servers: number; stickers: number };
  moderation: { complaintsNew: number; complaintsInProgress: number; actionsLast24h: number };
  economy: { starsInCirculation: number; transactionsLast24h: number };
}

export async function getPlatformStats(): Promise<PlatformStats> {
  const result = await query<Record<string, unknown>>(
    `SELECT
       (SELECT COUNT(*) FROM users)::int AS users_total,
       (SELECT COUNT(*) FROM users WHERE last_seen_at > now() - interval '5 minutes')::int AS users_online,
       (SELECT COUNT(*) FROM users WHERE blocked_at IS NOT NULL AND (blocked_until IS NULL OR blocked_until > now()))::int AS users_blocked,
       (SELECT COUNT(*) FROM users WHERE is_verified)::int AS users_verified,
       (SELECT COUNT(*) FROM users WHERE role = 'moderator')::int AS users_moderators,
       (SELECT COUNT(*) FROM messages WHERE deleted_at IS NULL)::int AS messages,
       (SELECT COUNT(*) FROM conversations)::int AS conversations,
       (SELECT COUNT(*) FROM servers)::int AS servers,
       (SELECT COUNT(*) FROM stickers)::int AS stickers,
       (SELECT COUNT(*) FROM complaints WHERE status = 'new')::int AS complaints_new,
       (SELECT COUNT(*) FROM complaints WHERE status = 'in_progress')::int AS complaints_progress,
       (SELECT COUNT(*) FROM admin_action_logs WHERE created_at > now() - interval '24 hours')::int AS actions_24h,
       (SELECT COALESCE(SUM(balance), 0)::int FROM user_wallets)::int AS stars_total,
       (SELECT COUNT(*) FROM star_transactions WHERE created_at > now() - interval '24 hours')::int AS star_tx_24h`,
  );
  const row = result.rows[0] ?? {};
  const num = (key: string): number => Number(row[key] ?? 0);
  return {
    users: {
      total: num('users_total'),
      online: num('users_online'),
      blocked: num('users_blocked'),
      verified: num('users_verified'),
      moderators: num('users_moderators'),
    },
    content: { messages: num('messages'), conversations: num('conversations'), servers: num('servers'), stickers: num('stickers') },
    moderation: {
      complaintsNew: num('complaints_new'),
      complaintsInProgress: num('complaints_progress'),
      actionsLast24h: num('actions_24h'),
    },
    economy: { starsInCirculation: num('stars_total'), transactionsLast24h: num('star_tx_24h') },
  };
}

export interface AuditFilters {
  action?: string | undefined;
  userId?: string | undefined;
  limit: number;
  offset: number;
}

export async function listAuditLogs(filters: AuditFilters): Promise<{ items: AdminActionLog[]; total: number }> {
  const values: unknown[] = [];
  const where: string[] = [];
  if (filters.action) {
    values.push(filters.action);
    where.push(`l.action = $${values.length}`);
  }
  if (filters.userId) {
    values.push(filters.userId);
    where.push(`(l.actor_id = $${values.length} OR l.target_user_id = $${values.length})`);
  }
  const clause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
  const countResult = await query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM admin_action_logs l${clause}`, values);

  values.push(filters.limit, filters.offset);
  const rows = await query<Record<string, unknown>>(
    `SELECT l.id, l.action, l.target_id, l.details, l.created_at,
            l.actor_id, au.username AS actor_username, au.display_name AS actor_display_name,
            au.avatar_url AS actor_avatar_url, au.role AS actor_role,
            l.target_user_id, tu.username AS target_username, tu.display_name AS target_display_name,
            tu.avatar_url AS target_avatar_url
     FROM admin_action_logs l
     LEFT JOIN users au ON au.id = l.actor_id
     LEFT JOIN users tu ON tu.id = l.target_user_id
     ${clause}
     ORDER BY l.id DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  const logs = rows.rows.map((row): AdminActionLog => {
    const actor = row.actor_id == null ? null : {
      ...serializeSender({
        id: row.actor_id,
        username: row.actor_username,
        display_name: row.actor_display_name,
        avatar_url: row.actor_avatar_url,
      }),
      role: row.actor_role as UserRole,
    };
    return {
      id: String(row.id),
      action: row.action as AdminActionLog['action'],
      actor,
      targetUser: row.target_user_id == null ? null : serializeSender({
        id: row.target_user_id,
        username: row.target_username,
        display_name: row.target_display_name,
        avatar_url: row.target_avatar_url,
      }),
      targetId: String(row.target_id ?? ''),
      details: row.details && typeof row.details === 'object' ? row.details as Record<string, unknown> : {},
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    };
  });
  return { items: logs, total: Number(countResult.rows[0]?.count ?? 0) };
}

export interface DeletedMessage {
  messageId: string;
  conversationId: string;
  senderId: string | null;
  filenames: (string | undefined)[];
}

export async function deleteMessageByStaff(actor: AuthContext, messageId: string): Promise<DeletedMessage> {
  return withTransaction(async (client) => {
    const found = await client.query<{ id: string; conversation_id: string; sender_id: string; deleted_at: Date | null }>(
      'SELECT id, conversation_id, sender_id, deleted_at FROM messages WHERE id = $1',
      [messageId],
    );
    const message = found.rows[0];
    if (!message) throw notFound('Повідомлення не знайдено');
    if (message.deleted_at) {
      return { messageId, conversationId: message.conversation_id, senderId: message.sender_id, filenames: [] };
    }
    const attachments = await client.query<{ storage_path: string; references: string }>(
      `SELECT a.storage_path,
              (SELECT COUNT(*) FROM attachments other WHERE other.storage_path = a.storage_path) AS references
       FROM attachments a WHERE a.message_id = $1`,
      [messageId],
    );
    await client.query('DELETE FROM attachments WHERE message_id = $1', [messageId]);
    await client.query('DELETE FROM message_reactions WHERE message_id = $1', [messageId]);
    await client.query(
      'UPDATE messages SET deleted_at = now(), pinned_at = NULL, pinned_by = NULL WHERE id = $1',
      [messageId],
    );
    await recordAudit(client, {
      action: 'message.delete',
      actor,
      targetUserId: message.sender_id,
      targetId: messageId,
      details: { conversationId: message.conversation_id },
    });
    return {
      messageId,
      conversationId: message.conversation_id,
      senderId: message.sender_id,
      filenames: attachments.rows
        .filter((row) => Number(row.references) <= 1)
        .map((row) => row.storage_path.split('/').pop()),
    };
  });
}
