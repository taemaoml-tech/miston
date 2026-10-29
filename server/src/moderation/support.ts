import { z } from 'zod';
import { recordAudit } from '../auth/audit';
import { withTransaction, query } from '../db/pool';
import type { AuthContext, ComplaintStatus, Sender } from '../types/domain';
import { notFound } from '../utils/errors';

export const SUPPORT_TOPICS = ['account', 'technical', 'report', 'star', 'feedback', 'other'] as const;
export const supportTopicSchema = z.enum(SUPPORT_TOPICS);
export type SupportTopic = z.infer<typeof supportTopicSchema>;
export type SupportStatus = ComplaintStatus;

export interface SupportRequest {
  id: string;
  topic: SupportTopic;
  message: string;
  status: SupportStatus;
  resolution: string;
  contactEmail: string | null;
  requester: Sender | null;
  createdAt: string;
  handledAt: string | null;
}

export const createSupportSchema = z.object({
  topic: supportTopicSchema.default('other'),
  message: z.string().trim().min(10, 'Опишіть звернення щонайменше 10 символів').max(2000),
  contactEmail: z.string().trim().email().max(254).optional(),
});

export const supportQuerySchema = z.object({
  status: z.enum(['new', 'in_progress', 'closed', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(50).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});

const SELECT = `
  SELECT s.id, s.topic, s.message, s.status, s.resolution, s.contact_email,
         s.created_at, s.handled_at,
         u.id AS requester_id, u.username AS requester_username,
         u.display_name AS requester_display_name, u.avatar_url AS requester_avatar_url,
         u.is_verified AS requester_is_verified
  FROM support_requests s
  LEFT JOIN users u ON u.id = s.user_id`;

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapRequest(row: Record<string, unknown>): SupportRequest {
  const id = row.requester_id;
  return {
    id: String(row.id),
    topic: row.topic as SupportTopic,
    message: String(row.message),
    status: row.status as SupportStatus,
    resolution: String(row.resolution ?? ''),
    contactEmail: row.contact_email == null ? null : String(row.contact_email),
    requester: id == null ? null : {
      id: String(id),
      username: String(row.requester_username ?? ''),
      displayName: String(row.requester_display_name ?? ''),
      avatarUrl: row.requester_avatar_url == null ? null : String(row.requester_avatar_url),
      isVerified: Boolean(row.requester_is_verified),
    },
    createdAt: iso(row.created_at),
    handledAt: row.handled_at == null ? null : iso(row.handled_at),
  };
}

export async function createSupportRequest(
  actor: AuthContext | null,
  input: z.infer<typeof createSupportSchema>,
): Promise<SupportRequest> {
  const inserted = await query<{ id: string }>(
    `INSERT INTO support_requests (user_id, contact_email, topic, message)
     VALUES ($1, $2, $3::text, $4) RETURNING id`,
    [actor?.userId ?? null, input.contactEmail ?? null, input.topic, input.message],
  );
  const id = String(inserted.rows[0]?.id);
  const found = await query<Record<string, unknown>>(`${SELECT} WHERE s.id = $1`, [id]);
  const row = found.rows[0];
  if (!row) throw notFound('Звернення не знайдено');
  return mapRequest(row);
}

export async function listMySupportRequests(userId: string, limit: number): Promise<SupportRequest[]> {
  const result = await query<Record<string, unknown>>(
    `${SELECT} WHERE s.user_id = $1 ORDER BY s.id DESC LIMIT $2`,
    [userId, limit],
  );
  return result.rows.map(mapRequest);
}

export async function listSupportRequests(filters: {
  status: SupportStatus | 'all';
  limit: number;
  offset: number;
}): Promise<{ items: SupportRequest[]; total: number; counts: Record<SupportStatus, number> }> {
  const where = filters.status === 'all' ? '' : 'WHERE s.status = $1';
  const values: unknown[] = filters.status === 'all' ? [] : [filters.status];
  const [counts, total, page] = await Promise.all([
    query<{ status: string; count: number }>(
      'SELECT status, COUNT(*)::int AS count FROM support_requests GROUP BY status',
    ),
    query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM support_requests s ${where}`, values),
    query<Record<string, unknown>>(
      `${SELECT}${where} ORDER BY s.id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, filters.limit, filters.offset],
    ),
  ]);

  const result: Record<SupportStatus, number> = { new: 0, in_progress: 0, closed: 0 };
  for (const row of counts.rows) result[row.status as SupportStatus] = Number(row.count);
  return { items: page.rows.map(mapRequest), total: Number(total.rows[0]?.count ?? 0), counts: result };
}

export async function updateSupportStatus(
  actor: AuthContext,
  id: string,
  status: SupportStatus,
  resolution: string,
): Promise<SupportRequest> {
  return withTransaction(async (client) => {
    const found = await client.query<{ id: string; user_id: string | null; status: string }>(
      'SELECT id, user_id, status FROM support_requests WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (!found.rows[0]) throw notFound('Звернення не знайдено');

    await client.query(
      `UPDATE support_requests
       SET status = $2::text,
           resolution = CASE WHEN $2::text = 'closed' THEN $3 ELSE resolution END,
           handled_at = CASE WHEN $2::text = 'closed' THEN now() ELSE handled_at END,
           updated_at = now()
       WHERE id = $1`,
      [id, status, resolution],
    );
    await recordAudit(client, {
      action: 'support.status',
      actor,
      targetUserId: found.rows[0]?.user_id ?? null,
      targetId: id,
      details: { status, resolution },
    });

    const updated = await client.query<Record<string, unknown>>(`${SELECT} WHERE s.id = $1`, [id]);
    const row = updated.rows[0];
    if (!row) throw notFound('Звернення не знайдено');
    return mapRequest(row);
  });
}
