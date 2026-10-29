import { recordAudit } from '../auth/audit';
import { query, withTransaction } from '../db/pool';
import { notFound } from '../utils/errors';
import type { AuthContext, SystemNotification } from '../types/domain';

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function map(row: Record<string, unknown>): SystemNotification {
  return {
    id: String(row.id),
    title: String(row.title),
    body: String(row.body ?? ''),
    createdAt: iso(row.created_at),
    readAt: row.read_at == null ? null : iso(row.read_at),
  };
}

export async function sendSystemNotification(
  actor: AuthContext,
  input: { title: string; body: string },
): Promise<SystemNotification> {
  return withTransaction(async (client) => {
    const inserted = await client.query<{ id: string; created_at: Date }>(
      'INSERT INTO system_notifications (actor_id, title, body) VALUES ($1, $2, $3) RETURNING id, created_at',
      [actor.userId, input.title, input.body],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error('Не вдалося створити системне сповіщення');
    await recordAudit(client, {
      action: 'notification.send',
      actor,
      targetId: row.id,
      details: { title: input.title, body: input.body },
    });
    return { id: String(row.id), title: input.title, body: input.body, createdAt: iso(row.created_at), readAt: null };
  });
}

export async function listSystemNotifications(userId: string, limit: number): Promise<SystemNotification[]> {
  const result = await query<Record<string, unknown>>(
    `SELECT n.id, n.title, n.body, n.created_at, r.read_at
     FROM system_notifications n
     LEFT JOIN system_notification_reads r ON r.notification_id = n.id AND r.user_id = $1
     ORDER BY n.id DESC LIMIT $2`,
    [userId, limit],
  );
  return result.rows.map(map);
}

export async function markSystemNotificationRead(userId: string, notificationId: string): Promise<SystemNotification> {
  const exists = await query('SELECT 1 FROM system_notifications WHERE id = $1', [notificationId]);
  if (exists.rowCount === 0) throw notFound('Сповіщення не знайдено');
  await query(
    `INSERT INTO system_notification_reads (notification_id, user_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [notificationId, userId],
  );
  const result = await query<Record<string, unknown>>(
    `SELECT n.id, n.title, n.body, n.created_at, r.read_at
     FROM system_notifications n
     LEFT JOIN system_notification_reads r ON r.notification_id = n.id AND r.user_id = $1
     WHERE n.id = $2`,
    [userId, notificationId],
  );
  const row = result.rows[0];
  if (!row) throw notFound('Сповіщення не знайдено');
  return map(row);
}

export interface SentNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  recipients: number;
  read: number;
}

export async function listSentNotifications(limit: number): Promise<SentNotification[]> {
  const result = await query<Record<string, unknown>>(
    `SELECT n.id, n.title, n.body, n.created_at,
            (SELECT COUNT(*) FROM users)::int AS recipients,
            (SELECT COUNT(*) FROM system_notification_reads r WHERE r.notification_id = n.id)::int AS read_count
     FROM system_notifications n
     ORDER BY n.id DESC LIMIT $1`,
    [limit],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    body: String(row.body ?? ''),
    createdAt: iso(row.created_at),
    recipients: Number(row.recipients ?? 0),
    read: Number(row.read_count ?? 0),
  }));
}
