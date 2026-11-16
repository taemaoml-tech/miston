import { query, withTransaction } from '../db/pool';
import { getMessageById } from '../db/messages';
import { listConversations } from '../db/conversations';
import { emitConversationCreated, emitMessageNew, emitMessageUpdated } from '../sockets/emitter';
import type { Message } from '../types/domain';

/**
 * Службовий чат «Miston»: через нього надсилаються коди підтвердження входу
 * та інші системні повідомлення. Бот — звичайний користувач із прапорцем
 * is_bot, тому чат нічим не відрізняється від звичайного листування.
 */

export interface BotUser {
  id: string;
  displayName: string;
}

let cachedBot: BotUser | null = null;

export async function getBotUser(): Promise<BotUser | null> {
  if (cachedBot) return cachedBot;
  const result = await query<{ id: string; display_name: string }>(
    'SELECT id, display_name FROM users WHERE is_bot = true ORDER BY created_at LIMIT 1',
  );
  const row = result.rows[0];
  if (!row) return null;
  cachedBot = { id: String(row.id), displayName: String(row.display_name) };
  return cachedBot;
}

interface BotMessage {
  conversationId: string;
  messageId: string;
  message: Message;
}

/**
 * Надсилає повідомлення від імені бота в його особистий чат із користувачем,
 * створюючи чат за потреби. Повертає ідентифікатори, щоб код можна було
 * згодом прибрати з історії після успішного підтвердження входу.
 */
export async function sendBotMessage(userId: string, content: string): Promise<BotMessage | null> {
  const bot = await getBotUser();
  if (!bot) {
    console.error('Miston bot account is missing; run migration 015');
    return null;
  }

  const directKey = `bot:${userId}`;
  let created = false;
  const conversationId = await withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [directKey]);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO conversations (kind, direct_key, created_by)
       VALUES ('direct', $1, $2) ON CONFLICT (direct_key) DO NOTHING RETURNING id`,
      [directKey, bot.id],
    );
    if (inserted.rows[0]) {
      created = true;
      await client.query(
        `INSERT INTO conversation_members (conversation_id, user_id, role)
         VALUES ($1, $2, 'owner'), ($1, $3, 'member')`,
        [inserted.rows[0].id, bot.id, userId],
      );
      return inserted.rows[0].id;
    }
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM conversations WHERE direct_key = $1', [directKey],
    );
    const id = existing.rows[0]?.id;
    if (!id) throw new Error('Bot conversation lookup failed');
    return id;
  });

  const inserted = await query<{ id: string }>(
    `INSERT INTO messages (conversation_id, sender_id, kind, content)
     VALUES ($1, $2, 'text', $3) RETURNING id`,
    [conversationId, bot.id, content],
  );
  const messageId = inserted.rows[0]?.id;
  const message = messageId ? await getMessageById(String(messageId)) : null;
  if (!messageId || !message) return null;

  if (created) {
    const conversation = (await listConversations(userId, conversationId))[0];
    if (conversation) emitConversationCreated(conversation, [userId, bot.id]);
  }
  emitMessageNew(message, [userId]);
  return { conversationId, messageId: String(messageId), message };
}

/** Прибирає код із чату після підтвердження входу. */
export async function replaceBotMessage(messageId: string, content: string): Promise<void> {
  await query('UPDATE messages SET content = $2, edited_at = now() WHERE id = $1', [messageId, content]);
  const message = await getMessageById(messageId);
  if (message) emitMessageUpdated(message);
}
