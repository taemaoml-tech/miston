import { Router } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool';
import { getMessageById, messageProjection } from '../db/messages';
import { unhideConversationMembers } from '../db/conversations';
import { isSoloConversation } from '../conversations/saved';
import { getUsableSticker, recordStickerUse } from '../db/stickers';
import { requireAuth } from '../middleware/auth';
import { requireConversationMembership } from '../middleware/membership';
import { kindForMime, mimeMatchesKind, removeUpload, safeOriginalName, upload } from '../middleware/uploads';
import { emitMessageDeleted, emitMessageNew, emitMessageReactions, emitMessageRead, emitMessageUpdated, emitMention, emitStarUpdate } from '../sockets/emitter';
import { recordMessageReward } from '../star/service';
import { asyncHandler } from '../utils/http';
import { AppError, forbidden, notFound } from '../utils/errors';
import { REACTION_EMOJIS } from '../utils/reactions';
import { serializeMessage } from '../utils/serializers';
import { messageId, uuid } from '../utils/validation';
import type { ConversationKind, MessageKind } from '../types/domain';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use('/:id', requireConversationMembership);

const listQuery = z.object({
  before: messageId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const messageBody = z.object({
  content: z.string().max(10_000).default(''),
  kind: z.enum(['text', 'image', 'video', 'video_note', 'document', 'voice']).optional(),
  durationSeconds: z.preprocess(
    (value) => value === '' || value == null ? undefined : value,
    z.coerce.number().int().min(0).max(86_400).optional(),
  ),
  replyToId: messageId.optional(),
});
const readBody = z.object({ messageId });
const stickerBody = z.object({ stickerId: uuid, replyToId: messageId.optional() });
const paramsSchema = z.object({ id: uuid });
const actionParams = z.object({ id: uuid, messageId });
const editBody = z.object({ content: z.string().max(10_000) });
const reactionBody = z.object({ emoji: z.enum(REACTION_EMOJIS) });
const forwardBody = z.object({ targetConversationId: uuid });

const mentionPattern = /(?:^|[\s(])@([a-zA-Z0-9_]{3,32})/g;

function mentionedUsernames(content: string): string[] {
  const found = new Set<string>();
  for (const match of content.matchAll(mentionPattern)) {
    if (match[1]) found.add(match[1].toLowerCase());
  }
  return [...found];
}

async function resolveMentionedMembers(
  client: PoolClient,
  conversationId: string,
  content: string,
  senderId: string,
): Promise<string[]> {
  const usernames = mentionedUsernames(content);
  if (usernames.length === 0) return [];
  const result = await client.query(
    `SELECT u.id FROM conversation_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.conversation_id = $1 AND lower(u.username::text) = ANY($2::text[]) AND u.id <> $3`,
    [conversationId, usernames, senderId],
  );
  return result.rows.map((row) => String(row.id));
}

interface MessageContextRow {
  sender_id: string;
  kind: MessageKind;
  deleted_at: Date | null;
  pinned_at: Date | null;
  conversation_kind: ConversationKind;
  role: 'owner' | 'admin' | 'member' | null;
}

async function loadMessageContext(conversationId: string, id: string, userId: string): Promise<MessageContextRow> {
  const result = await query<MessageContextRow>(
    `SELECT m.sender_id, m.kind, m.deleted_at, m.pinned_at,
            c.kind AS conversation_kind, cm.role
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     LEFT JOIN conversation_members cm
       ON cm.conversation_id = m.conversation_id AND cm.user_id = $3
     WHERE m.id = $1 AND m.conversation_id = $2`,
    [id, conversationId, userId],
  );
  const row = result.rows[0];
  if (!row) throw notFound('Повідомлення не знайдено в цій розмові');
  return row;
}

async function loadConversationKind(conversationId: string): Promise<ConversationKind> {
  const result = await query<{ kind: ConversationKind }>(
    'SELECT kind FROM conversations WHERE id = $1', [conversationId],
  );
  const row = result.rows[0];
  if (!row) throw notFound('Розмову не знайдено');
  return row.kind;
}

function isConversationManager(row: MessageContextRow): boolean {
  return !isSoloConversation(row.conversation_kind) && (row.role === 'owner' || row.role === 'admin');
}

function canPin(row: MessageContextRow): boolean {
  return isSoloConversation(row.conversation_kind) || isConversationManager(row);
}

async function loadUpdatedMessage(id: string): Promise<ReturnType<typeof serializeMessage>> {
  const message = await getMessageById(id);
  if (!message) throw notFound('Повідомлення не знайдено');
  return message;
}

router.get('/:id/messages', asyncHandler(async (req, res) => {
  const { id } = paramsSchema.parse(req.params);
  const { before, limit } = listQuery.parse(req.query);
  const result = await query<Record<string, unknown>>(
    `SELECT ${messageProjection}
     FROM messages m JOIN users u ON u.id = m.sender_id
     JOIN conversation_members viewer ON viewer.conversation_id = m.conversation_id AND viewer.user_id = $4
     WHERE m.conversation_id = $1 AND m.deleted_at IS NULL
       AND m.id > viewer.cleared_after_id
       AND ($2::bigint IS NULL OR m.id < $2)
     ORDER BY m.id DESC LIMIT $3`,
    [id, before?.toString() ?? null, limit + 1, req.auth!.userId],
  );
  const hasMore = result.rows.length > limit;
  const descending = result.rows.slice(0, limit);
  const nextCursor = hasMore && descending.length > 0 ? String(descending[descending.length - 1]?.id) : null;
  const items = descending.reverse().map(serializeMessage);
  res.json({ items, nextCursor });
}));

router.post('/:id/messages', upload.single('file'), asyncHandler(async (req, res) => {
  const { id } = paramsSchema.parse(req.params);
  const conversationKind = await loadConversationKind(id);
  const input = messageBody.parse(req.body);
  const kind = input.kind ?? (req.file ? kindForMime(req.file.mimetype) : 'text');

  if (!req.file && (kind !== 'text' || !input.content.trim())) {
    throw new AppError(400, 'INVALID_MESSAGE', 'Текстове повідомлення не може бути порожнім');
  }
  if (req.file && (kind === 'text' || !mimeMatchesKind(req.file.mimetype, kind))) {
    await removeUpload(req.file.filename);
    throw new AppError(400, 'INVALID_MESSAGE_KIND', 'Тип повідомлення не відповідає завантаженому файлу');
  }
  if (kind === 'video_note' && req.file && req.file.size < 1024) {
    await removeUpload(req.file.filename);
    throw new AppError(400, 'EMPTY_VIDEO_NOTE', 'Відеокружечок порожній. Запишіть його ще раз');
  }
  if (kind === 'video_note' && (input.durationSeconds ?? 0) > 60) {
    if (req.file) await removeUpload(req.file.filename);
    throw new AppError(400, 'VIDEO_NOTE_TOO_LONG', 'Відеокружечок не може бути довшим за 60 секунд');
  }

  try {
    const { message, recipients, mentioned } = await withTransaction(async (client) => {
      const replyToId = input.replyToId?.toString() ?? null;
      if (replyToId) {
        const target = await client.query(
          'SELECT 1 FROM messages WHERE id = $1 AND conversation_id = $2 AND deleted_at IS NULL',
          [replyToId, id],
        );
        if (target.rowCount === 0) throw notFound('Повідомлення для відповіді не знайдено');
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO messages (conversation_id, sender_id, kind, content, duration_seconds, reply_to_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [id, req.auth!.userId, kind, input.content, input.durationSeconds ?? null, replyToId],
      );
      const newId = inserted.rows[0]?.id;
      if (!newId) throw new Error('Message insert returned no row');

      if (req.file) {
        await client.query(
          `INSERT INTO attachments (message_id, storage_path, original_name, mime_type, size_bytes)
           VALUES ($1, $2, $3, $4, $5)`,
          [newId, `/uploads/${req.file.filename}`, safeOriginalName(req.file.originalname), req.file.mimetype, req.file.size],
        );
      }
      const mentioned = await resolveMentionedMembers(client, id, input.content, req.auth!.userId);
      if (mentioned.length > 0) {
        await client.query(
          `INSERT INTO message_mentions (message_id, user_id)
           SELECT $1, unnest($2::uuid[])`,
          [newId, mentioned],
        );
      }
      const members = await client.query<{ user_id: string }>(
        'SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id <> $2',
        [id, req.auth!.userId],
      );
      await unhideConversationMembers(client, id);
      const created = await getMessageById(newId, client);
      if (!created) throw new Error('Failed to load created message');
      return { message: created, recipients: members.rows.map((row) => row.user_id), mentioned };
    });

    emitMessageNew(message, recipients);
    emitMention(message, mentioned);
    // Star rewards are best-effort: a wallet hiccup must never lose the message.
    // Нотатки не рахуються: інакше ⭐ і рівень фармляться одним пакетом «на собі».
    const star = conversationKind === 'saved' ? null : await recordMessageReward(req.auth!.userId).catch((error) => {
      console.error('Failed to record Star activity', error);
      return null;
    });
    if (star) emitStarUpdate(req.auth!.userId, star);
    res.status(201).json({ message, ...(star ? { star } : {}) });
  } catch (error) {
    await removeUpload(req.file?.filename);
    throw error;
  }
}));

router.post('/:id/stickers', asyncHandler(async (req, res) => {
  const { id } = paramsSchema.parse(req.params);
  const { stickerId, replyToId } = stickerBody.parse(req.body);
  const userId = req.auth!.userId;
  const conversationKind = await loadConversationKind(id);
  const sticker = await getUsableSticker(stickerId.toString(), userId);
  if (!sticker) throw notFound('Стікер недоступний');

  const { message, recipients } = await withTransaction(async (client) => {
    const target = replyToId?.toString() ?? null;
    if (target) {
      const exists = await client.query(
        'SELECT 1 FROM messages WHERE id = $1 AND conversation_id = $2 AND deleted_at IS NULL',
        [target, id],
      );
      if (exists.rowCount === 0) throw notFound('Повідомлення для відповіді не знайдено');
    }
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO messages (conversation_id, sender_id, kind, content, sticker_id, reply_to_id)
       VALUES ($1, $2, 'sticker', $3, $4, $5) RETURNING id`,
      // The label stays on the row so the chat keeps a readable stub if the
      // sticker is later removed from its pack.
      [id, userId, sticker.label, sticker.id, target],
    );
    const newId = inserted.rows[0]?.id;
    if (!newId) throw new Error('Sticker message insert returned no row');
    const members = await client.query<{ user_id: string }>(
      'SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id <> $2',
      [id, userId],
    );
    await unhideConversationMembers(client, id);
    const created = await getMessageById(newId, client);
    if (!created) throw new Error('Failed to load created sticker message');
    return { message: created, recipients: members.rows.map((row) => row.user_id) };
  });

  await recordStickerUse(userId, sticker.id);
  emitMessageNew(message, recipients);
  const star = conversationKind === 'saved' ? null : await recordMessageReward(userId).catch((error) => {
    console.error('Failed to record Star activity', error);
    return null;
  });
  if (star) emitStarUpdate(userId, star);
  res.status(201).json({ message, ...(star ? { star } : {}) });
}));

router.post('/:id/messages/:messageId/forward', asyncHandler(async (req, res) => {
  const { id, messageId: rawMessageId } = actionParams.parse(req.params);
  const sourceId = rawMessageId.toString();
  const { targetConversationId } = forwardBody.parse(req.body);
  const context = await loadMessageContext(id, sourceId, req.auth!.userId);
  if (context.deleted_at) throw notFound('Повідомлення вже видалено');

  const { message, recipients } = await withTransaction(async (client) => {
    const target = await client.query(
      'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
      [targetConversationId, req.auth!.userId],
    );
    if (target.rowCount === 0) throw forbidden('Немає доступу до цільової розмови');

    const source = await getMessageById(sourceId, client);
    if (!source) throw notFound('Повідомлення не знайдено');

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO messages (
         conversation_id, sender_id, kind, content, duration_seconds, sticker_id,
         forwarded_from_user_id, forwarded_from_conversation_id, forwarded_from_message_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        targetConversationId, req.auth!.userId, source.kind, source.content, source.durationSeconds,
        source.sticker?.id ?? null,
        source.senderId, id, sourceId,
      ],
    );
    const newId = inserted.rows[0]?.id;
    if (!newId) throw new Error('Forward insert returned no row');

    for (const attachment of source.attachments) {
      await client.query(
        `INSERT INTO attachments (message_id, storage_path, original_name, mime_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5)`,
        [newId, attachment.url, attachment.originalName, attachment.mimeType, attachment.sizeBytes],
      );
    }

    const members = await client.query<{ user_id: string }>(
      'SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id <> $2',
      [targetConversationId, req.auth!.userId],
    );
    await unhideConversationMembers(client, targetConversationId);
    const created = await getMessageById(newId, client);
    if (!created) throw new Error('Failed to load forwarded message');
    return { message: created, recipients: members.rows.map((row) => row.user_id) };
  });

  emitMessageNew(message, recipients);
  res.status(201).json({ message });
}));

router.post('/:id/read', asyncHandler(async (req, res) => {
  const { id } = paramsSchema.parse(req.params);
  const { messageId: rawMessageId } = readBody.parse(req.body);
  const readMessageId = rawMessageId.toString();
  const message = await query(
    'SELECT 1 FROM messages WHERE id = $1 AND conversation_id = $2 AND deleted_at IS NULL',
    [readMessageId, id],
  );
  if (message.rowCount === 0) throw notFound('Повідомлення не знайдено в цій розмові');

  const updated = await query(
    `UPDATE conversation_members SET last_read_message_id = $3
     WHERE conversation_id = $1 AND user_id = $2
       AND (last_read_message_id IS NULL OR last_read_message_id < $3)`,
    [id, req.auth!.userId, readMessageId],
  );
  if (updated.rowCount === 1) emitMessageRead(id, readMessageId, req.auth!.userId);
  res.status(204).send();
}));

router.patch('/:id/messages/:messageId', asyncHandler(async (req, res) => {
  const { id, messageId: rawMessageId } = actionParams.parse(req.params);
  const messageIdValue = rawMessageId.toString();
  const { content } = editBody.parse(req.body);
  const context = await loadMessageContext(id, messageIdValue, req.auth!.userId);

  if (context.deleted_at) throw notFound('Повідомлення вже видалено');
  if (context.sender_id !== req.auth!.userId) {
    throw forbidden('Редагувати можна лише власні повідомлення');
  }
  if (context.kind === 'voice' || context.kind === 'video_note' || context.kind === 'sticker') {
    throw new AppError(400, 'EDIT_NOT_ALLOWED', 'Голосові повідомлення, відеокружечки та стікери не можна редагувати');
  }
  const normalized = content.trim();
  if (context.kind === 'text' && !normalized) {
    throw new AppError(400, 'INVALID_MESSAGE', 'Текстове повідомлення не може бути порожнім');
  }

  const mentioned = await withTransaction(async (client) => {
    await client.query(
      'UPDATE messages SET content = $2, edited_at = now() WHERE id = $1',
      [messageIdValue, normalized],
    );
    await client.query('DELETE FROM message_mentions WHERE message_id = $1', [messageIdValue]);
    const ids = await resolveMentionedMembers(client, id, normalized, req.auth!.userId);
    if (ids.length > 0) {
      await client.query(
        'INSERT INTO message_mentions (message_id, user_id) SELECT $1, unnest($2::uuid[])',
        [messageIdValue, ids],
      );
    }
    return ids;
  });
  const message = await loadUpdatedMessage(messageIdValue);
  emitMessageUpdated(message);
  if (mentioned.length > 0) emitMention(message, mentioned);
  res.json({ message });
}));

router.delete('/:id/messages/:messageId', asyncHandler(async (req, res) => {
  const { id, messageId: rawMessageId } = actionParams.parse(req.params);
  const messageIdValue = rawMessageId.toString();
  const context = await loadMessageContext(id, messageIdValue, req.auth!.userId);

  if (context.deleted_at) {
    res.json({ messageId: messageIdValue });
    return;
  }
  if (context.sender_id !== req.auth!.userId && !isConversationManager(context)) {
    throw forbidden('Немає прав видаляти це повідомлення');
  }

  const uploads = await withTransaction(async (client) => {
    // Forwarded messages can reference the same stored file; only the last
    // reference is allowed to delete it from disk.
    const attachments = await client.query<{ storage_path: string; references: string }>(
      `SELECT a.storage_path,
              (SELECT COUNT(*) FROM attachments other WHERE other.storage_path = a.storage_path) AS references
       FROM attachments a WHERE a.message_id = $1`,
      [messageIdValue],
    );
    await client.query('DELETE FROM attachments WHERE message_id = $1', [messageIdValue]);
    await client.query('DELETE FROM message_reactions WHERE message_id = $1', [messageIdValue]);
    await client.query(
      `UPDATE messages
       SET deleted_at = now(), pinned_at = NULL, pinned_by = NULL
       WHERE id = $1`, [messageIdValue],
    );
    return attachments.rows
      .filter((row) => Number(row.references) <= 1)
      .map((row) => row.storage_path.split('/').pop());
  });
  await Promise.all(uploads.map((filename) => removeUpload(filename)));

  emitMessageDeleted(id, messageIdValue);
  res.json({ messageId: messageIdValue });
}));

router.post('/:id/messages/:messageId/reactions', asyncHandler(async (req, res) => {
  const { id, messageId: rawMessageId } = actionParams.parse(req.params);
  const messageIdValue = rawMessageId.toString();
  const { emoji } = reactionBody.parse(req.body);
  const userId = req.auth!.userId;
  const context = await loadMessageContext(id, messageIdValue, userId);
  if (context.deleted_at) throw notFound('Повідомлення вже видалено');

  await withTransaction(async (client) => {
    const removed = await client.query(
      `DELETE FROM message_reactions
       WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [messageIdValue, userId, emoji],
    );
    if (removed.rowCount === 0) {
      await client.query(
        'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)',
        [messageIdValue, userId, emoji],
      );
    }
  });

  const message = await loadUpdatedMessage(messageIdValue);
  emitMessageReactions(message);
  res.json({ message });
}));

router.get('/:id/pins', asyncHandler(async (req, res) => {
  const { id } = paramsSchema.parse(req.params);
  const result = await query<Record<string, unknown>>(
    `SELECT ${messageProjection}
     FROM messages m JOIN users u ON u.id = m.sender_id
     JOIN conversation_members viewer ON viewer.conversation_id = m.conversation_id AND viewer.user_id = $2
     WHERE m.conversation_id = $1 AND m.pinned_at IS NOT NULL AND m.deleted_at IS NULL
       AND m.id > viewer.cleared_after_id
     ORDER BY m.pinned_at DESC, m.id DESC
     LIMIT 100`,
    [id, req.auth!.userId],
  );
  res.json({ items: result.rows.map(serializeMessage) });
}));

router.post('/:id/pins/:messageId', asyncHandler(async (req, res) => {
  const { id, messageId: rawMessageId } = actionParams.parse(req.params);
  const messageIdValue = rawMessageId.toString();
  const context = await loadMessageContext(id, messageIdValue, req.auth!.userId);
  if (context.deleted_at) throw notFound('Повідомлення вже видалено');
  if (!canPin(context)) throw forbidden('Закріплювати повідомлення можуть власник або адміністратор');

  await query(
    'UPDATE messages SET pinned_at = now(), pinned_by = $2 WHERE id = $1',
    [messageIdValue, req.auth!.userId],
  );
  const message = await loadUpdatedMessage(messageIdValue);
  emitMessageUpdated(message);
  res.json({ message });
}));

router.delete('/:id/pins/:messageId', asyncHandler(async (req, res) => {
  const { id, messageId: rawMessageId } = actionParams.parse(req.params);
  const messageIdValue = rawMessageId.toString();
  const context = await loadMessageContext(id, messageIdValue, req.auth!.userId);
  if (context.deleted_at) throw notFound('Повідомлення вже видалено');
  if (!canPin(context)) throw forbidden('Знімати закріплення можуть власник або адміністратор');

  await query(
    'UPDATE messages SET pinned_at = NULL, pinned_by = NULL WHERE id = $1',
    [messageIdValue],
  );
  const message = await loadUpdatedMessage(messageIdValue);
  emitMessageUpdated(message);
  res.json({ message });
}));

export default router;
