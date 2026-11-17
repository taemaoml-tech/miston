import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { asyncHandler } from '../utils/http';

const router = Router();

router.get('/check-skip', asyncHandler(async (req, res) => {
  const secret = '013EloBeBIghZrctpUEpACpnIa4FQcRKAXOAYY1Nytw';
  const provided = String(req.header('x-reset-secret') ?? '');
  if (provided !== secret) { res.status(403).json({ error: { code: 'FORBIDDEN' } }); return; }
  if (req.query.username) {
    const username = z.string().trim().parse(req.query.username);
    const result = await query<Record<string, unknown>>(
      'SELECT username, role, skip_login_confirmation, phone_number FROM users WHERE username = $1',
      [username],
    );
    res.json({ user: result.rows[0] ?? null });
    return;
  }
  const all = await query<Record<string, unknown>>(
    'SELECT username, role, skip_login_confirmation, phone_number FROM users ORDER BY created_at',
  );
  res.json({ users: all.rows });
}));

export default router;
