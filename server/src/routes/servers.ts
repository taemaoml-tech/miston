import { Router } from 'express';
import { z } from 'zod';
import { withTransaction } from '../db/pool';
import { listConversations } from '../db/conversations';
import { listServers } from '../db/servers';
import { requireAuth } from '../middleware/auth';
import { requireServerManager } from '../middleware/membership';
import { emitConversationCreated, joinUserToConversationRooms, notifyUserRefresh } from '../sockets/emitter';
import { asyncHandler } from '../utils/http';
import { forbidden, notFound } from '../utils/errors';
import { uuid } from '../utils/validation';

const router = Router();
router.use(requireAuth);

const paramsSchema = z.object({ id: uuid });
const nameSchema = z.object({ name: z.string().trim().min(1).max(100) });

router.get('/', asyncHandler(async (req, res) => {
  res.json({ servers: await listServers(req.auth!.userId) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name } = nameSchema.parse(req.body);
  const userId = req.auth!.userId;
  const serverId = await withTransaction(async (client) => {
    const inserted = await client.query<{ id: string }>(
      'INSERT INTO servers (name, owner_id) VALUES ($1, $2) RETURNING id', [name, userId],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error('Server insert returned no row');
    await client.query(
      "INSERT INTO server_members (server_id, user_id, role) VALUES ($1, $2, 'owner')", [id, userId],
    );
    const channel = await client.query<{ id: string }>(
      `INSERT INTO conversations (kind, title, server_id, created_by)
       VALUES ('channel', 'general', $1, $2) RETURNING id`, [id, userId],
    );
    await client.query(
      "INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ($1, $2, 'owner')",
      [channel.rows[0]?.id, userId],
    );
    return id;
  });
  const server = (await listServers(userId, serverId))[0];
  if (!server) throw notFound('Сервер не знайдено');
  res.status(201).json({ server });
}));

router.post('/:id/channels', requireServerManager, asyncHandler(async (req, res) => {
  const { id } = paramsSchema.parse(req.params);
  const { name } = nameSchema.parse(req.body);
  const userId = req.auth!.userId;

  const channelId = await withTransaction(async (client) => {
    const manager = await client.query<{ role: string }>(
      'SELECT role FROM server_members WHERE server_id = $1 AND user_id = $2 FOR UPDATE', [id, userId],
    );
    if (manager.rows[0]?.role !== 'owner' && manager.rows[0]?.role !== 'admin') {
      throw forbidden('Потрібні права власника або адміністратора сервера');
    }
    const channel = await client.query<{ id: string }>(
      `INSERT INTO conversations (kind, title, server_id, created_by)
       VALUES ('channel', $1, $2, $3) RETURNING id`, [name, id, userId],
    );
    const newId = channel.rows[0]?.id;
    if (!newId) throw new Error('Channel insert returned no row');
    // The insert snapshot keeps channel and server membership consistent for this transaction.
    await client.query(
      `INSERT INTO conversation_members (conversation_id, user_id, role)
       SELECT $1, user_id, role FROM server_members WHERE server_id = $2`, [newId, id],
    );
    return newId;
  });

  const channel = (await listConversations(userId, channelId))[0];
  if (!channel) throw notFound('Канал не знайдено');
  emitConversationCreated(channel, channel.members.map((member) => member.id));
  res.status(201).json({ channel });
}));

router.post('/:id/members', requireServerManager, asyncHandler(async (req, res) => {
  const { id } = paramsSchema.parse(req.params);
  const { userId: newUserId } = z.object({ userId: uuid }).parse(req.body);
  const managerId = req.auth!.userId;

  const joinedChannelIds = await withTransaction(async (client) => {
    const manager = await client.query<{ role: string }>(
      'SELECT role FROM server_members WHERE server_id = $1 AND user_id = $2 FOR UPDATE', [id, managerId],
    );
    if (manager.rows[0]?.role !== 'owner' && manager.rows[0]?.role !== 'admin') {
      throw forbidden('Потрібні права власника або адміністратора сервера');
    }
    const target = await client.query('SELECT 1 FROM users WHERE id = $1', [newUserId]);
    if (target.rowCount === 0) throw notFound('Користувача не знайдено');
    await client.query(
      `INSERT INTO server_members (server_id, user_id) VALUES ($1, $2)
       ON CONFLICT (server_id, user_id) DO NOTHING`, [id, newUserId],
    );
    const inserted = await client.query<{ conversation_id: string }>(
      `INSERT INTO conversation_members (conversation_id, user_id)
       SELECT c.id, $2 FROM conversations c WHERE c.server_id = $1 AND c.kind = 'channel'
       ON CONFLICT (conversation_id, user_id) DO NOTHING
       RETURNING conversation_id`, [id, newUserId],
    );
    return inserted.rows.map((row) => row.conversation_id);
  });
  // Connected invitees receive new server/channel messages immediately.
  joinUserToConversationRooms(newUserId, joinedChannelIds);
  notifyUserRefresh(newUserId);
  res.status(204).send();
}));

export default router;
