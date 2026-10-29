import type { PoolClient } from 'pg';
import { query } from './pool';
import { serializeMessage } from '../utils/serializers';
import type { Message } from '../types/domain';

export const messageProjection = `
  m.*, u.username AS sender_username, u.display_name AS sender_display_name,
  u.avatar_url AS sender_avatar_url, u.cosmetics AS sender_cosmetics,
  u.is_verified AS sender_is_verified,
  COALESCE((
    SELECT json_agg(json_build_object(
      'id', a.id, 'url', a.storage_path, 'originalName', a.original_name,
      'mimeType', a.mime_type, 'sizeBytes', a.size_bytes, 'createdAt', a.created_at
    ) ORDER BY a.created_at, a.id)
    FROM attachments a WHERE a.message_id = m.id
  ), '[]'::json) AS attachments,
  COALESCE((
    SELECT json_agg(json_build_object('emoji', r.emoji, 'userIds', r.user_ids) ORDER BY r.emoji)
    FROM (
      SELECT mr.emoji, json_agg(mr.user_id ORDER BY mr.created_at, mr.user_id) AS user_ids
      FROM message_reactions mr
      WHERE mr.message_id = m.id
      GROUP BY mr.emoji
    ) r
  ), '[]'::json) AS reactions,
  -- Group/channel members store a monotonic read cursor. Excluding the sender
  -- leaves a compact receipt list without a row per user per message.
  COALESCE((
    SELECT json_agg(cm.user_id)
    FROM conversation_members cm
    WHERE cm.conversation_id = m.conversation_id
      AND cm.user_id <> m.sender_id
      AND cm.last_read_message_id >= m.id
  ), '[]'::json) AS read_by,
  (
    SELECT json_build_object(
      'id', r.id,
      'senderId', r.sender_id,
      'senderName', ru.display_name,
      'content', CASE WHEN r.deleted_at IS NULL THEN r.content ELSE '' END,
      'kind', r.kind,
      'deleted', r.deleted_at IS NOT NULL
    )
    FROM messages r JOIN users ru ON ru.id = r.sender_id
    WHERE r.id = m.reply_to_id
  ) AS reply_to,
  (
    SELECT json_build_object(
      'userId', fu.id,
      'username', fu.username,
      'displayName', fu.display_name,
      'conversationId', m.forwarded_from_conversation_id,
      'conversationTitle', fc.title
    )
    FROM users fu
    LEFT JOIN conversations fc ON fc.id = m.forwarded_from_conversation_id
    WHERE fu.id = m.forwarded_from_user_id
  ) AS forwarded_from,
  COALESCE((
    SELECT json_agg(mm.user_id) FROM message_mentions mm WHERE mm.message_id = m.id
  ), '[]'::json) AS mentions,
  (
    SELECT json_build_object(
      'id', s.id,
      'slug', s.slug,
      'label', s.label,
      'asset', s.asset,
      'animation', s.animation,
      'packName', p.name,
      'packSlug', p.slug,
      'category', p.category
    )
    FROM stickers s JOIN sticker_packs p ON p.id = s.pack_id
    WHERE s.id = m.sticker_id
  ) AS sticker`;

export async function getMessageById(id: string, client?: PoolClient): Promise<Message | null> {
  const text = `SELECT ${messageProjection}
    FROM messages m JOIN users u ON u.id = m.sender_id
    WHERE m.id = $1 AND m.deleted_at IS NULL`;
  const result = client ? await client.query<Record<string, unknown>>(text, [id]) : await query(text, [id]);
  return result.rows[0] ? serializeMessage(result.rows[0]) : null;
}
