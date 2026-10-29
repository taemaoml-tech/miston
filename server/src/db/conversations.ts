import type { PoolClient } from 'pg';
import { query } from './pool';
import { serializeMessage, serializeSender } from '../utils/serializers';
import { isUserOnline } from '../sockets/presence';
import type { Message } from '../types/domain';

export interface ConversationMember {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  bio: string;
  online: boolean;
  role: string;
  lastReadMessageId: string | null;
  alias: string | null;
}

export interface ConversationSummary {
  id: string;
  kind: 'direct' | 'group' | 'channel';
  title: string | null;
  avatarUrl: string | null;
  serverId: string | null;
  members: ConversationMember[];
  lastMessage: Message | null;
  unreadCount: number;
}

const attachmentsJson = `COALESCE((
  SELECT json_agg(json_build_object(
    'id', a.id, 'url', a.storage_path, 'originalName', a.original_name,
    'mimeType', a.mime_type, 'sizeBytes', a.size_bytes, 'createdAt', a.created_at
  ) ORDER BY a.created_at, a.id)
  FROM attachments a WHERE a.message_id = m.id
), '[]'::json) AS attachments`;

export async function listConversations(userId: string, onlyId?: string): Promise<ConversationSummary[]> {
  const conversations = await query<Record<string, unknown>>(
    `SELECT c.*, cm.last_read_message_id, cm.cleared_after_id, cm.hidden_at
     FROM conversations c JOIN conversation_members cm ON cm.conversation_id = c.id
     WHERE cm.user_id = $1 AND ($2::uuid IS NULL OR c.id = $2)
       -- Схований чат повертається у список, коли після водоїми з'явилося хоч одне повідомлення.
       AND (cm.hidden_at IS NULL OR EXISTS (
         SELECT 1 FROM messages m
         WHERE m.conversation_id = c.id AND m.deleted_at IS NULL AND m.id > cm.cleared_after_id
       ))
     ORDER BY c.created_at DESC`,
    [userId, onlyId ?? null],
  );
  if (conversations.rows.length === 0) return [];

  const ids = conversations.rows.map((row) => String(row.id));
  const [memberRows, messageRows, unreadRows] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT cm.conversation_id, cm.user_id, cm.role, cm.last_read_message_id,
              u.username, u.display_name, u.avatar_url, u.bio, u.cosmetics, u.is_verified,
              fa.alias
       FROM conversation_members cm
       JOIN users u ON u.id = cm.user_id
       LEFT JOIN friend_aliases fa ON fa.owner_id = $2 AND fa.friend_id = cm.user_id
       WHERE cm.conversation_id = ANY($1::uuid[]) ORDER BY u.username`,
      [ids, userId],
    ),
    query<Record<string, unknown>>(
      `SELECT DISTINCT ON (m.conversation_id)
              m.*, u.username AS sender_username, u.display_name AS sender_display_name,
              u.avatar_url AS sender_avatar_url, u.cosmetics AS sender_cosmetics,
              u.is_verified AS sender_is_verified, ${attachmentsJson}
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       JOIN conversation_members viewer ON viewer.conversation_id = m.conversation_id AND viewer.user_id = $2
       WHERE m.conversation_id = ANY($1::uuid[]) AND m.deleted_at IS NULL
         AND m.id > viewer.cleared_after_id
       ORDER BY m.conversation_id, m.id DESC`,
      [ids, userId],
    ),
    query<Record<string, unknown>>(
      `SELECT m.conversation_id, COUNT(*)::int AS unread_count
       FROM messages m
       JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = $1
       WHERE m.conversation_id = ANY($2::uuid[]) AND m.deleted_at IS NULL
         AND m.sender_id <> $1 AND m.id > COALESCE(cm.last_read_message_id, 0)
         AND m.id > cm.cleared_after_id
       GROUP BY m.conversation_id`,
      [userId, ids],
    ),
  ]);

  const membersByConversation = new Map<string, ConversationMember[]>();
  for (const row of memberRows.rows) {
    const conversationId = String(row.conversation_id);
    const sender = serializeSender({ ...row, sender_id: row.user_id });
    const members = membersByConversation.get(conversationId) ?? [];
    members.push({
      ...sender,
      isVerified: Boolean(row.is_verified),
      bio: String(row.bio ?? ''),
      online: isUserOnline(sender.id),
      role: String(row.role),
      lastReadMessageId: row.last_read_message_id == null ? null : String(row.last_read_message_id),
      alias: row.alias == null ? null : String(row.alias),
    });
    membersByConversation.set(conversationId, members);
  }
  const messagesByConversation = new Map(
    messageRows.rows.map((row) => [String(row.conversation_id), serializeMessage(row)]),
  );
  const unreadByConversation = new Map(
    unreadRows.rows.map((row) => [String(row.conversation_id), Number(row.unread_count)]),
  );

  return conversations.rows.map((row) => {
    const id = String(row.id);
    const members = membersByConversation.get(id) ?? [];
    const otherMember = row.kind === 'direct' ? members.find((member) => member.id !== userId) : undefined;
    return {
      id,
      kind: row.kind as ConversationSummary['kind'],
      title: otherMember ? (otherMember.alias || otherMember.displayName) : (row.title == null ? null : String(row.title)),
      avatarUrl: otherMember?.avatarUrl ?? (row.avatar_url == null ? null : String(row.avatar_url)),
      serverId: row.server_id == null ? null : String(row.server_id),
      members,
      lastMessage: messagesByConversation.get(id) ?? null,
      unreadCount: unreadByConversation.get(id) ?? 0,
    };
  });
}

/** Нове повідомлення повертає схований чат у список усіх учасників. */
export async function unhideConversationMembers(client: PoolClient, conversationId: string): Promise<void> {
  await client.query(
    'UPDATE conversation_members SET hidden_at = NULL WHERE conversation_id = $1 AND hidden_at IS NOT NULL',
    [conversationId],
  );
}
