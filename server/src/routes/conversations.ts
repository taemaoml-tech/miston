import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool';
import { listConversations } from '../db/conversations';
import { clearHistory, deleteConversation } from '../conversations/cleanup';
import { savedConversationKey } from '../conversations/saved';
import { requireAuth } from '../middleware/auth';
import { requireConversationMembership } from '../middleware/membership';
import { emitConversationCreated } from '../sockets/emitter';
import { asyncHandler } from '../utils/http';
import { AppError, notFound } from '../utils/errors';
import { uuid } from '../utils/validation';

const router = Router();
router.use(requireAuth);

const createSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('direct'), userId: uuid }),
  z.object({ kind: z.literal('saved') }),
  z.object({
    kind: z.literal('group'),
    title: z.string().trim().min(1).max(100),
    memberIds: z.array(uuid).min(1).max(99).transform((ids) => [...new Set(ids)]),
  }),
]);

const idParams = z.object({ id: uuid });
const cleanupBody = z.object({ scope: z.enum(['me', 'everyone']).default('me') });

router.get('/', asyncHandler(async (req, res) => {
  res.json({ conversations: await listConversations(req.auth!.userId) });
}));

router.post('/:id/clear', requireConversationMembership, asyncHandler(async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { scope } = cleanupBody.parse(req.body ?? {});
  res.json(await clearHistory(req.auth!, id, scope));
}));

router.delete('/:id', requireConversationMembership, asyncHandler(async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { scope } = cleanupBody.parse(req.body ?? {});
  res.json(await deleteConversation(req.auth!, id, scope));
}));

router.post('/', asyncHandler(async (req, res) => {
  const input = createSchema.parse(req.body);
  const userId = req.auth!.userId;

  if (input.kind === 'saved') {
    const savedKey = savedConversationKey(userId);
    let created = false;

    const conversationId = await withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [savedKey]);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO conversations (kind, direct_key, created_by)
         VALUES ('saved', $1, $2) ON CONFLICT (direct_key) DO NOTHING RETURNING id`,
        [savedKey, userId],
      );
      if (inserted.rows[0]) {
        created = true;
        await client.query(
          `INSERT INTO conversation_members (conversation_id, user_id, role)
           VALUES ($1, $2, 'owner')`,
          [inserted.rows[0].id, userId],
        );
        return inserted.rows[0].id;
      }
      const existing = await client.query<{ id: string }>(
        'SELECT id FROM conversations WHERE direct_key = $1', [savedKey],
      );
      if (!existing.rows[0]) throw notFound('Розмову не знайдено');
      return existing.rows[0].id;
    });

    // «Видалити чат» для себе ховає розмову зі списку, і без цього скидання
    // повторне відкриття нотаток дало б 404 на вже існуючому чаті.
    await query(
      'UPDATE conversation_members SET hidden_at = NULL WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, userId],
    );
    const conversation = (await listConversations(userId, conversationId))[0];
    if (!conversation) throw notFound('Розмову не знайдено');
    // Ні емісії, ні інфо-повідомлення: в цій розмові більше немає кому.
    res.status(created ? 201 : 200).json({ conversation });
    return;
  }

  if (input.kind === 'direct') {
    if (input.userId === userId) {
      throw new AppError(400, 'INVALID_DIRECT_CHAT', 'Не можна створити особисту розмову із собою');
    }
    const pair = [userId, input.userId].sort();
    const directKey = `${pair[0]}:${pair[1]}`;
    let created = false;

    const conversationId = await withTransaction(async (client) => {
      const target = await client.query('SELECT 1 FROM users WHERE id = $1', [input.userId]);
      if (target.rowCount === 0) throw notFound('Користувача не знайдено');
      // The key-scoped advisory lock avoids duplicate memberships under concurrent creates.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [directKey]);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO conversations (kind, direct_key, created_by)
         VALUES ('direct', $1, $2) ON CONFLICT (direct_key) DO NOTHING RETURNING id`,
        [directKey, userId],
      );
      if (inserted.rows[0]) {
        created = true;
        await client.query(
          `INSERT INTO conversation_members (conversation_id, user_id)
           VALUES ($1, $2), ($1, $3)`,
          [inserted.rows[0].id, userId, input.userId],
        );
        return inserted.rows[0].id;
      }
      const existing = await client.query<{ id: string }>(
        'SELECT id FROM conversations WHERE direct_key = $1', [directKey],
      );
      if (!existing.rows[0]) throw notFound('Розмову не знайдено');
      return existing.rows[0].id;
    });

    const conversation = (await listConversations(userId, conversationId))[0];
    if (!conversation) throw notFound('Розмову не знайдено');
    if (created) emitConversationCreated(conversation, conversation.members.map((member) => member.id));
    res.status(created ? 201 : 200).json({ conversation });
    return;
  }

  const otherMemberIds = input.memberIds.filter((id) => id !== userId);
  if (otherMemberIds.length === 0) {
    throw new AppError(400, 'MEMBERS_REQUIRED', 'Для групи потрібен щонайменше один інший учасник');
  }

  const conversationId = await withTransaction(async (client) => {
    const users = await client.query(
      'SELECT id FROM users WHERE id = ANY($1::uuid[])', [otherMemberIds],
    );
    if (users.rowCount !== otherMemberIds.length) {
      throw new AppError(400, 'INVALID_MEMBERS', 'Один або кілька учасників не існують');
    }
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO conversations (kind, title, created_by)
       VALUES ('group', $1, $2) RETURNING id`,
      [input.title, userId],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error('Conversation insert returned no row');
    const memberIds = [userId, ...otherMemberIds];
    await client.query(
      `INSERT INTO conversation_members (conversation_id, user_id, role)
       SELECT $1, u.id, (CASE WHEN u.id = $2 THEN 'owner' ELSE 'member' END)::member_role
       FROM users u WHERE u.id = ANY($3::uuid[])`,
      [id, userId, memberIds],
    );
    return id;
  });

  const conversation = (await listConversations(userId, conversationId))[0];
  if (!conversation) throw notFound('Розмову не знайдено');
  emitConversationCreated(conversation, conversation.members.map((member) => member.id));
  res.status(201).json({ conversation });
}));

export default router;
