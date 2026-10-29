import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { avatarUpload, removeUpload } from '../middleware/uploads';
import { asyncHandler } from '../utils/http';
import { AppError, notFound } from '../utils/errors';
import { serializeProfile, serializeUser } from '../utils/serializers';
import { friendshipState } from '../utils/friendship';
import { isUserOnline } from '../sockets/presence';

const router = Router();
router.use(requireAuth);

const patchSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  username: z.string().trim().regex(/^[A-Za-z0-9_]{3,30}$/).optional(),
  bio: z.string().trim().max(500).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'Потрібно вказати хоча б одне поле' });

router.get('/search', asyncHandler(async (req, res) => {
  const { q } = z.object({ q: z.string().trim().min(1).max(100) }).parse(req.query);
  const me = req.auth!.userId;
  const escaped = q.replace(/[\\%_]/g, '\\$&');
  const result = await query<Record<string, unknown>>(
    `SELECT u.*, f.status AS friend_status, f.requester_id AS friend_requester_id
     FROM users u
     LEFT JOIN friendships f
       ON (f.requester_id = u.id AND f.addressee_id = $2)
       OR (f.addressee_id = u.id AND f.requester_id = $2)
     WHERE u.id <> $2 AND (u.username ILIKE $1 ESCAPE '\\' OR u.display_name ILIKE $1 ESCAPE '\\')
     ORDER BY u.username ASC LIMIT 20`,
    [`%${escaped}%`, me],
  );
  res.json({
    users: result.rows.map((row) => serializeProfile(
      row,
      friendshipState(row, me),
      isUserOnline(String(row.id)),
    )),
  });
}));

router.get('/:id/profile', asyncHandler(async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const me = req.auth!.userId;

  if (id === me) {
    const self = await query<Record<string, unknown>>('SELECT * FROM users WHERE id = $1', [id]);
    if (!self.rows[0]) throw notFound('Користувача не знайдено');
    res.json({ user: serializeProfile(self.rows[0], 'self', true), mutualFriends: 0 });
    return;
  }

  const result = await query<Record<string, unknown>>(
    `SELECT u.*, f.status AS friend_status, f.requester_id AS friend_requester_id
     FROM users u
     LEFT JOIN friendships f
       ON (f.requester_id = u.id AND f.addressee_id = $2)
       OR (f.addressee_id = u.id AND f.requester_id = $2)
     WHERE u.id = $1`,
    [id, me],
  );
  const row = result.rows[0];
  if (!row) throw notFound('Користувача не знайдено');

  const mutual = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM (
       SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS friend_id
       FROM friendships
       WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)
     ) mine
     JOIN (
       SELECT CASE WHEN requester_id = $2 THEN addressee_id ELSE requester_id END AS friend_id
       FROM friendships
       WHERE status = 'accepted' AND (requester_id = $2 OR addressee_id = $2)
     ) theirs ON theirs.friend_id = mine.friend_id`,
    [me, id],
  );

  res.json({
    user: serializeProfile(row, friendshipState(row, me), isUserOnline(id)),
    mutualFriends: Number(mutual.rows[0]?.count ?? 0),
  });
}));

router.patch('/me', asyncHandler(async (req, res) => {
  const input = patchSchema.parse(req.body);
  const result = await query<Record<string, unknown>>(
    `UPDATE users SET
       display_name = COALESCE($2, display_name),
       username = COALESCE($3, username),
       bio = COALESCE($4, bio),
       updated_at = now()
     WHERE id = $1 RETURNING *`,
    [req.auth!.userId, input.displayName ?? null, input.username ?? null, input.bio ?? null],
  );
  if (!result.rows[0]) throw notFound('Користувача не знайдено');
  res.json({ user: serializeUser(result.rows[0]) });
}));

router.post('/me/avatar', avatarUpload.single('avatar'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError(400, 'FILE_REQUIRED', 'Потрібно вибрати файл аватара');
  }

  try {
    const previous = await query<{ avatar_url: string | null }>(
      'SELECT avatar_url FROM users WHERE id = $1', [req.auth!.userId],
    );
    if (previous.rowCount === 0) throw notFound('Користувача не знайдено');

    const avatarUrl = `/uploads/${req.file.filename}`;
    const result = await query<Record<string, unknown>>(
      'UPDATE users SET avatar_url = $2, updated_at = now() WHERE id = $1 RETURNING *',
      [req.auth!.userId, avatarUrl],
    );
    const user = result.rows[0];
    if (!user) throw notFound('Користувача не знайдено');

    const previousUrl = previous.rows[0]?.avatar_url;
    if (previousUrl?.startsWith('/uploads/')) {
      await removeUpload(previousUrl.slice('/uploads/'.length));
    }
    res.json({ user: serializeUser(user) });
  } catch (error) {
    await removeUpload(req.file.filename);
    throw error;
  }
}));

export default router;
