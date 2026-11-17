import { Router } from 'express';
import { z } from 'zod';
import { withTransaction } from '../db/pool';
import { listConversations } from '../db/conversations';
import { requireAuth } from '../middleware/auth';
import { emitConversationCreated, joinUserToConversationRooms, notifyUserRefresh } from '../sockets/emitter';
import { asyncHandler } from '../utils/http';
import { notFound } from '../utils/errors';
import { uuid } from '../utils/validation';

const router = Router();
router.use(requireAuth);

const nameSchema = z.object({ title: z.string().trim().min(1).max(100).default('Зустріч') });

router.post('/', asyncHandler(async (req, res) => {
  const { title } = nameSchema.parse(req.body ?? {});
  const userId = req.auth!.userId;

  const meetingId = await withTransaction(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO conversations (kind, title, created_by)
       VALUES ('meeting', $1, $2) RETURNING id`,
      [title, userId],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error('Meeting insert returned no row');
    await client.query(
      "INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ($1, $2, 'owner')",
      [id, userId],
    );
    return id;
  });

  const conversation = (await listConversations(userId, meetingId))[0];
  if (conversation) {
    emitConversationCreated(conversation, [userId]);
    joinUserToConversationRooms(userId, [meetingId]);
  }
  res.status(201).json({ meeting: { id: meetingId, title, link: `/meeting/${meetingId}` } });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const userId = req.auth!.userId;
  const conversation = (await listConversations(userId, id))[0];
  if (!conversation) {
    // Користувач ще не приєднаний — повертаємо базову інформацію.
    const result = await (await import('../db/pool')).query<{ id: string; title: string | null; created_by: string }>(
      'SELECT id, title, created_by FROM conversations WHERE id = $1 AND kind = $2',
      [id, 'meeting'],
    );
    const row = result.rows[0];
    if (!row) throw notFound('Зустріч не знайдено');
    res.json({ meeting: { id: String(row.id), title: row.title, link: `/meeting/${row.id}` } });
    return;
  }
  res.json({ meeting: { id: conversation.id, title: conversation.title, link: `/meeting/${conversation.id}` }, conversation });
}));

router.post('/:id/join', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const userId = req.auth!.userId;

  await withTransaction(async (client) => {
    const exists = await client.query('SELECT 1 FROM conversations WHERE id = $1 AND kind = $2', [id, 'meeting']);
    if (!exists.rowCount) throw notFound('Зустріч не знайдено');
    await client.query(
      `INSERT INTO conversation_members (conversation_id, user_id, role)
       VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
      [id, userId],
    );
  });

  const conversation = (await listConversations(userId, id))[0];
  if (conversation) {
    joinUserToConversationRooms(userId, [id]);
    notifyUserRefresh(userId);
  }
  res.json({ meeting: { id, link: `/meeting/${id}` }, conversation: conversation ?? null });
}));

export default router;
