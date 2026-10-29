import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { emitFriendshipChanged, emitStarUpdate } from '../sockets/emitter';
import { rewardFriendInvite } from '../star/service';
import { isUserOnline } from '../sockets/presence';
import type { FriendProfile, FriendRequestProfile, Sender } from '../types/domain';
import { AppError, notFound } from '../utils/errors';
import { asyncHandler } from '../utils/http';
import { serializeProfile } from '../utils/serializers';

const router = Router();
router.use(requireAuth);

const userParams = z.object({ userId: z.string().uuid() });

function isoDate(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

async function loadActor(userId: string): Promise<Sender> {
  const result = await query<{ id: string; username: string; display_name: string; avatar_url: string | null }>(
    'SELECT id, username, display_name, avatar_url FROM users WHERE id = $1', [userId],
  );
  const row = result.rows[0];
  if (!row) throw notFound('Користувача не знайдено');
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    avatarUrl: row.avatar_url == null ? null : String(row.avatar_url),
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const me = req.auth!.userId;
  const [friends, incoming, outgoing] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT u.*, f.created_at AS friends_since, fa.alias
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
       LEFT JOIN friend_aliases fa ON fa.owner_id = $1 AND fa.friend_id = u.id
       WHERE (f.requester_id = $1 OR f.addressee_id = $1) AND f.status = 'accepted'
       ORDER BY COALESCE(fa.alias, u.display_name) ASC, u.username ASC`,
      [me],
    ),
    query<Record<string, unknown>>(
      `SELECT u.*, f.created_at AS requested_at
       FROM friendships f
       JOIN users u ON u.id = f.requester_id
       WHERE f.addressee_id = $1 AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [me],
    ),
    query<Record<string, unknown>>(
      `SELECT u.*, f.created_at AS requested_at
       FROM friendships f
       JOIN users u ON u.id = f.addressee_id
       WHERE f.requester_id = $1 AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [me],
    ),
  ]);

  const friendItems: FriendProfile[] = friends.rows.map((row) => ({
    ...serializeProfile(row, 'friends', isUserOnline(String(row.id))),
    friendsSince: isoDate(row.friends_since),
    alias: row.alias == null ? null : String(row.alias),
  }));
  const incomingItems: FriendRequestProfile[] = incoming.rows.map((row) => ({
    ...serializeProfile(row, 'incoming', isUserOnline(String(row.id))),
    requestedAt: isoDate(row.requested_at),
  }));
  const outgoingItems: FriendRequestProfile[] = outgoing.rows.map((row) => ({
    ...serializeProfile(row, 'outgoing', isUserOnline(String(row.id))),
    requestedAt: isoDate(row.requested_at),
  }));

  res.json({ friends: friendItems, incoming: incomingItems, outgoing: outgoingItems });
}));

router.post('/requests', asyncHandler(async (req, res) => {
  const me = req.auth!.userId;
  const { userId } = z.object({ userId: z.string().uuid() }).parse(req.body);
  if (userId === me) throw new AppError(400, 'INVALID_TARGET', 'Не можна додати себе в друзі');

  const target = await query('SELECT 1 FROM users WHERE id = $1', [userId]);
  if (target.rowCount === 0) throw notFound('Користувача не знайдено');

  const existing = await query<{ requester_id: string; addressee_id: string; status: string }>(
    `SELECT requester_id, addressee_id, status FROM friendships
     WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
    [me, userId],
  );
  const relation = existing.rows[0];
  if (relation) {
    if (relation.status === 'accepted') {
      throw new AppError(409, 'ALREADY_FRIENDS', 'Ви вже друзі з цим користувачем');
    }
    if (String(relation.requester_id) === me) {
      throw new AppError(409, 'REQUEST_PENDING', 'Запит уже надіслано');
    }
    throw new AppError(409, 'INCOMING_REQUEST', 'Цей користувач уже надіслав вам запит. Прийміть його у розділі «Друзі».');
  }

  try {
    await query('INSERT INTO friendships (requester_id, addressee_id) VALUES ($1, $2)', [me, userId]);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new AppError(409, 'REQUEST_EXISTS', 'Запит уже існує');
    }
    throw error;
  }

  const actor = await loadActor(me);
  emitFriendshipChanged(userId, { type: 'request', actor });
  res.status(201).json({ status: 'outgoing' });
}));

router.post('/requests/:userId/accept', asyncHandler(async (req, res) => {
  const me = req.auth!.userId;
  const { userId } = userParams.parse(req.params);

  const result = await query(
    `UPDATE friendships SET status = 'accepted', responded_at = now()
     WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'
     RETURNING requester_id`,
    [userId, me],
  );
  if (result.rowCount === 0) throw notFound('Активний запит у друзі не знайдено');

  const actor = await loadActor(me);
  emitFriendshipChanged(userId, { type: 'accepted', actor });
  // The inviter earns Stars once per friend; a repeat friendship cannot be farmed.
  const star = await rewardFriendInvite(userId, me).catch((error) => {
    console.error('Failed to reward friend invite', error);
    return null;
  });
  if (star) emitStarUpdate(userId, star);
  res.json({ status: 'friends', ...(star ? { star } : {}) });
}));

router.delete('/requests/:userId', asyncHandler(async (req, res) => {
  const me = req.auth!.userId;
  const { userId } = userParams.parse(req.params);

  const result = await query<{ requester_id: string }>(
    `DELETE FROM friendships WHERE status = 'pending'
       AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))
     RETURNING requester_id`,
    [me, userId],
  );
  const deleted = result.rows[0];
  if (!deleted) throw notFound('Активний запит у друзі не знайдено');

  const actor = await loadActor(me);
  emitFriendshipChanged(userId, {
    type: String(deleted.requester_id) === me ? 'cancelled' : 'declined',
    actor,
  });
  res.status(204).end();
}));

router.delete('/:userId', asyncHandler(async (req, res) => {
  const me = req.auth!.userId;
  const { userId } = userParams.parse(req.params);

  const result = await query(
    `DELETE FROM friendships WHERE status = 'accepted'
       AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`,
    [me, userId],
  );
  if (result.rowCount === 0) throw notFound('Користувача не знайдено серед друзів');

  await query('DELETE FROM friend_aliases WHERE owner_id = $1 AND friend_id = $2', [me, userId]);
  const actor = await loadActor(me);
  emitFriendshipChanged(userId, { type: 'removed', actor });
  res.status(204).end();
}));

const aliasBody = z.object({ alias: z.string().trim().max(80) });

router.put('/:userId/alias', asyncHandler(async (req, res) => {
  const me = req.auth!.userId;
  const { userId } = userParams.parse(req.params);
  const { alias } = aliasBody.parse(req.body);
  if (userId === me) throw new AppError(400, 'INVALID_TARGET', 'Не можна перейменувати себе');

  const friendship = await query(
    `SELECT 1 FROM friendships WHERE status = 'accepted'
       AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`,
    [me, userId],
  );
  if (friendship.rowCount === 0) throw notFound('Користувача не знайдено серед друзів');

  if (!alias) {
    await query('DELETE FROM friend_aliases WHERE owner_id = $1 AND friend_id = $2', [me, userId]);
    res.json({ alias: null });
    return;
  }

  await query(
    `INSERT INTO friend_aliases (owner_id, friend_id, alias) VALUES ($1, $2, $3)
     ON CONFLICT (owner_id, friend_id)
     DO UPDATE SET alias = EXCLUDED.alias, updated_at = now()`,
    [me, userId, alias],
  );
  res.json({ alias });
}));

router.delete('/:userId/alias', asyncHandler(async (req, res) => {
  const me = req.auth!.userId;
  const { userId } = userParams.parse(req.params);
  await query('DELETE FROM friend_aliases WHERE owner_id = $1 AND friend_id = $2', [me, userId]);
  res.status(204).end();
}));

export default router;
