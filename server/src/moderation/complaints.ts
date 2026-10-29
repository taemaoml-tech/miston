import { z } from 'zod';
import { recordAudit } from '../auth/audit';
import { query, withTransaction } from '../db/pool';
import { AppError, notFound } from '../utils/errors';
import type { AdminAction, Complaint, ComplaintCategory, ComplaintStatus, AuthContext, Sender } from '../types/domain';

export const complaintCategorySchema = z.enum(['spam', 'harassment', 'nsfw', 'scam', 'copyright', 'other']);
export const complaintStatusSchema = z.enum(['new', 'in_progress', 'closed']);

export const submitComplaintSchema = z.object({
  targetUserId: z.string().uuid().optional(),
  messageId: z.coerce.bigint().positive().optional(),
  category: complaintCategorySchema.default('other'),
  description: z.string().trim().max(1000).default(''),
}).refine((value) => value.targetUserId !== undefined || value.messageId !== undefined, {
  message: 'Вкажіть користувача або повідомлення, на яке скаржитеся',
});

const SELECT = `
  SELECT c.id, c.category, c.description, c.status, c.resolution,
         c.message_id, c.conversation_id, c.created_at, c.updated_at, c.handled_at,
         c.complainant_id, cu.username AS complainant_username,
         cu.display_name AS complainant_display_name, cu.avatar_url AS complainant_avatar_url,
         cu.is_verified AS complainant_is_verified,
         c.target_user_id AS target_id, tu.username AS target_username,
         tu.display_name AS target_display_name, tu.avatar_url AS target_avatar_url,
         tu.is_verified AS target_is_verified,
         CASE WHEN m.deleted_at IS NULL THEN LEFT(m.content, 200) ELSE '' END AS message_preview
  FROM complaints c
  JOIN users cu ON cu.id = c.complainant_id
  LEFT JOIN users tu ON tu.id = c.target_user_id
  LEFT JOIN messages m ON m.id = c.message_id`;

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function nullableIso(value: unknown): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

function sender(prefix: string, row: Record<string, unknown>): Sender | null {
  const id = row[`${prefix}_id`];
  if (id == null) return null;
  return {
    id: String(id),
    username: String(row[`${prefix}_username`] ?? ''),
    displayName: String(row[`${prefix}_display_name`] ?? ''),
    avatarUrl: row[`${prefix}_avatar_url`] == null ? null : String(row[`${prefix}_avatar_url`]),
    isVerified: Boolean(row[`${prefix}_is_verified`]),
  };
}

function mapComplaint(row: Record<string, unknown>): Complaint {
  return {
    id: String(row.id),
    category: row.category as ComplaintCategory,
    description: String(row.description ?? ''),
    status: row.status as ComplaintStatus,
    resolution: String(row.resolution ?? ''),
    complainant: sender('complainant', row)!,
    targetUser: sender('target', row),
    messageId: row.message_id == null ? null : String(row.message_id),
    conversationId: row.conversation_id == null ? null : String(row.conversation_id),
    messagePreview: row.message_id == null ? null : String(row.message_preview ?? ''),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    handledAt: nullableIso(row.handled_at),
  };
}

export async function submitComplaint(userId: string, input: z.infer<typeof submitComplaintSchema>): Promise<Complaint> {
  let targetUserId = input.targetUserId ?? null;
  let messageId: string | null = null;
  let conversationId: string | null = null;

  if (input.messageId !== undefined) {
    messageId = input.messageId.toString();
    const found = await query<{ conversation_id: string; sender_id: string; deleted_at: Date | null }>(
      'SELECT conversation_id, sender_id, deleted_at FROM messages WHERE id = $1',
      [messageId],
    );
    const message = found.rows[0];
    if (!message || message.deleted_at) throw notFound('Повідомлення не знайдено');
    conversationId = message.conversation_id;
    targetUserId = targetUserId ?? message.sender_id;
  }

  if (!targetUserId) throw notFound('Користувача не знайдено');
  if (targetUserId === userId) {
    throw new AppError(400, 'CANNOT_COMPLAIN_SELF', 'Не можна подати скаргу на власний акаунт');
  }

  try {
    const inserted = await query<Record<string, unknown>>(
      `INSERT INTO complaints (complainant_id, target_user_id, message_id, conversation_id, category, description)
       VALUES ($1, $2, $3, $4, $5::text, $6) RETURNING id`,
      [userId, targetUserId, messageId, conversationId, input.category, input.description],
    );
    const id = String(inserted.rows[0]?.id);
    const result = await query<Record<string, unknown>>(`${SELECT} WHERE c.id = $1`, [id]);
    const row = result.rows[0];
    if (!row) throw notFound('Скаргу не знайдено');
    return mapComplaint(row);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      throw new AppError(409, 'DUPLICATE_COMPLAINT', 'У вас уже є відкрита скарга на цей акаунт');
    }
    if (error && typeof error === 'object' && 'code' in error && error.code === '23503') {
      throw notFound('Користувача не знайдено');
    }
    throw error;
  }
}

export async function listMyComplaints(userId: string, limit: number): Promise<Complaint[]> {
  const result = await query<Record<string, unknown>>(
    `${SELECT} WHERE c.complainant_id = $1 ORDER BY c.id DESC LIMIT $2`,
    [userId, limit],
  );
  return result.rows.map(mapComplaint);
}

export interface ComplaintFilters {
  status?: ComplaintStatus | undefined;
  category?: ComplaintCategory | undefined;
  q?: string | undefined;
  limit: number;
  offset: number;
}

export async function listComplaints(filters: ComplaintFilters): Promise<{
  items: Complaint[];
  total: number;
  counts: Record<ComplaintStatus, number>;
}> {
  const values: unknown[] = [];
  const where: string[] = [];
  if (filters.status) {
    values.push(filters.status);
    where.push(`c.status = $${values.length}`);
  }
  if (filters.category) {
    values.push(filters.category);
    where.push(`c.category = $${values.length}::text`);
  }
  if (filters.q) {
    values.push(`%${filters.q.replace(/[\\%_]/g, '\\$&')}%`);
    const placeholder = `$${values.length}`;
    where.push(`(c.description ILIKE ${placeholder} ESCAPE '\\' OR cu.username ILIKE ${placeholder} ESCAPE '\\' OR tu.username ILIKE ${placeholder} ESCAPE '\\')`);
  }
  const clause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';

  const [countResult, totalsResult, rows] = await Promise.all([
    query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM complaints c
       JOIN users cu ON cu.id = c.complainant_id
       LEFT JOIN users tu ON tu.id = c.target_user_id${clause}`,
      values,
    ),
    query<{ status: string; count: number }>(
      'SELECT status, COUNT(*)::int AS count FROM complaints GROUP BY status',
    ),
    query<Record<string, unknown>>(
      `${SELECT}${clause} ORDER BY c.id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, filters.limit, filters.offset],
    ),
  ]);

  const counts: Record<ComplaintStatus, number> = { new: 0, in_progress: 0, closed: 0 };
  for (const row of totalsResult.rows) counts[row.status as ComplaintStatus] = Number(row.count);

  return { items: rows.rows.map(mapComplaint), total: Number(countResult.rows[0]?.count ?? 0), counts };
}

export async function updateComplaintStatus(
  actor: AuthContext,
  complaintId: string,
  status: ComplaintStatus,
  resolution: string,
): Promise<Complaint> {
  return withTransaction(async (client) => {
    const found = await client.query<{ id: string; status: ComplaintStatus; resolution: string; target_user_id: string | null }>(
      'SELECT id, status, resolution, target_user_id FROM complaints WHERE id = $1 FOR UPDATE',
      [complaintId],
    );
    const current = found.rows[0];
    if (!current) throw notFound('Скаргу не знайдено');
    if (current.status === status && current.resolution === resolution) {
      throw new AppError(409, 'COMPLAINT_UNCHANGED', 'Цей статус і коментар до скарги вже збережено');
    }

    await client.query(
      `UPDATE complaints
       SET status = $2::text,
           assignee_id = CASE WHEN $2::text = 'in_progress' THEN COALESCE(assignee_id, $3) ELSE assignee_id END,
           resolution = CASE WHEN $2::text = 'closed' THEN $4 ELSE resolution END,
           handled_by = CASE WHEN $2::text = 'closed' THEN $3 ELSE handled_by END,
           handled_at = CASE WHEN $2::text = 'closed' THEN now() ELSE handled_at END,
           updated_at = now()
       WHERE id = $1`,
      [complaintId, status, actor.userId, resolution],
    );

    await recordAudit(client, {
      action: 'complaint.status',
      actor,
      targetUserId: current.target_user_id,
      targetId: complaintId,
      details: { from: current.status, to: status, resolution },
    });

    const result = await client.query<Record<string, unknown>>(`${SELECT} WHERE c.id = $1`, [complaintId]);
    const row = result.rows[0];
    if (!row) throw notFound('Скаргу не знайдено');
    return mapComplaint(row);
  });
}
