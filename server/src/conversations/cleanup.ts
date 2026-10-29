import type { PoolClient } from 'pg';
import { removeUpload } from '../middleware/uploads';
import { emitConversationCleared, emitConversationDeleted } from '../sockets/emitter';
import { withTransaction } from '../db/pool';
import { forbidden, notFound } from '../utils/errors';
import type { AuthContext } from '../types/domain';

export type CleanupScope = 'me' | 'everyone';

interface ConversationContext {
  kind: 'direct' | 'group' | 'channel';
  myRole: string;
  memberIds: string[];
}

async function loadContext(client: PoolClient, conversationId: string, userId: string): Promise<ConversationContext> {
  const result = await client.query<{ kind: string; my_role: string | null; member_ids: string[] }>(
    `SELECT c.kind,
            (SELECT cm.role FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = $2) AS my_role,
            ARRAY(SELECT cm.user_id FROM conversation_members cm WHERE cm.conversation_id = c.id) AS member_ids
     FROM conversations c WHERE c.id = $1`,
    [conversationId, userId],
  );
  const row = result.rows[0];
  if (!row?.my_role) throw notFound('Розмову не знайдено');
  return { kind: row.kind as ConversationContext['kind'], myRole: row.my_role, memberIds: row.member_ids };
}

function isManager(context: ConversationContext): boolean {
  return context.myRole === 'owner' || context.myRole === 'admin';
}

/** Водойма «я все тут бачив»: старі повідомлення зникають, нові — залишаються. */
async function setWatermark(client: PoolClient, conversationId: string, userId: string, hide: boolean): Promise<void> {
  await client.query(
    `UPDATE conversation_members cm
        SET cleared_after_id = watermark.id,
            last_read_message_id = watermark.id,
            hidden_at = CASE WHEN $3::boolean THEN now() ELSE cm.hidden_at END
       FROM (SELECT COALESCE(MAX(id), 0) AS id FROM messages WHERE conversation_id = $1) watermark
      WHERE cm.conversation_id = $1 AND cm.user_id = $2`,
    [conversationId, userId, hide],
  );
}

/** Файли вкладень, на які не посилається більше жодне живе повідомлення. */
async function collectOrphanFiles(client: PoolClient, conversationId: string): Promise<string[]> {
  const rows = await client.query<{ storage_path: string; references: string }>(
    `SELECT a.storage_path,
            (SELECT COUNT(*) FROM attachments other WHERE other.storage_path = a.storage_path) AS references
     FROM attachments a JOIN messages m ON m.id = a.message_id
     WHERE m.conversation_id = $1`,
    [conversationId],
  );
  return rows.rows
    .filter((row) => Number(row.references) <= 1)
    .map((row) => row.storage_path.split('/').pop())
    .filter((filename): filename is string => Boolean(filename));
}

export async function clearHistory(
  actor: AuthContext,
  conversationId: string,
  scope: CleanupScope,
): Promise<{ conversationId: string; scope: CleanupScope }> {
  const files = await withTransaction(async (client) => {
    const context = await loadContext(client, conversationId, actor.userId);
    if (scope === 'me') {
      await setWatermark(client, conversationId, actor.userId, false);
      return [];
    }
    if (context.kind === 'channel') {
      throw forbidden('Історію каналу очищає лише власник сервера');
    }
    if (context.kind !== 'direct' && !isManager(context)) {
      throw forbidden('Історію для всіх учасників очищає власник або адміністратор групи');
    }
    const uploads = await collectOrphanFiles(client, conversationId);
    await client.query(
      'DELETE FROM message_reactions WHERE message_id IN (SELECT id FROM messages WHERE conversation_id = $1)',
      [conversationId],
    );
    await client.query('DELETE FROM attachments WHERE message_id IN (SELECT id FROM messages WHERE conversation_id = $1)', [conversationId]);
    await client.query(
      `UPDATE messages SET deleted_at = now(), pinned_at = NULL, pinned_by = NULL
       WHERE conversation_id = $1 AND deleted_at IS NULL`,
      [conversationId],
    );
    return uploads;
  });

  await Promise.all(files.map((filename) => removeUpload(filename)));
  emitConversationCleared(conversationId, scope);
  return { conversationId, scope };
}

export async function deleteConversation(
  actor: AuthContext,
  conversationId: string,
  scope: CleanupScope,
): Promise<{ conversationId: string; scope: CleanupScope; left: boolean }> {
  const result = await withTransaction(async (client) => {
    const context = await loadContext(client, conversationId, actor.userId);
    if (scope === 'me') {
      if (context.kind === 'channel') {
        throw forbidden('Канал не можна покинути — він належить серверу. Очистіть історію для себе.');
      }
      if (context.kind === 'direct') {
        await setWatermark(client, conversationId, actor.userId, true);
        return { context, left: false, files: [] as string[] };
      }
      if (context.myRole === 'owner') {
        throw forbidden('Групу повністю видаляє лише її власник — оберіть «Видалити для всіх»');
      }
      await client.query('DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [conversationId, actor.userId]);
      return { context, left: true, files: [] as string[] };
    }

    if (context.kind === 'channel') throw forbidden('Канал видалює лише власник сервера');
    if (context.kind !== 'direct' && !isManager(context)) {
      throw forbidden('Групу повністю видаляє її власник або адміністратор');
    }
    const files = await collectOrphanFiles(client, conversationId);
    await client.query('DELETE FROM conversations WHERE id = $1', [conversationId]);
    return { context, left: true, files };
  });

  await Promise.all(result.files.map((filename) => removeUpload(filename)));
  emitConversationDeleted(conversationId, result.context.memberIds);
  return { conversationId, scope, left: result.left };
}
