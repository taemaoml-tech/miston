import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/http';
import { uuid } from '../utils/validation';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const result = await query<{ id: string; title: string; body: string; kind: string; read_at: Date | null; created_at: Date }>(
    `SELECT id, title, body, kind, read_at, created_at
     FROM mist_id_inbox WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.auth!.userId],
  );
  res.json({
    items: result.rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      body: String(r.body),
      kind: String(r.kind),
      read: r.read_at != null,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    })),
    unread: result.rows.filter((r) => r.read_at == null).length,
  });
}));

router.post('/:id/read', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  await query('UPDATE mist_id_inbox SET read_at = now() WHERE id = $1 AND user_id = $2', [id, req.auth!.userId]);
  res.json({ ok: true });
}));

router.post('/read-all', asyncHandler(async (req, res) => {
  await query('UPDATE mist_id_inbox SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.auth!.userId]);
  res.json({ ok: true });
}));

export default router;
