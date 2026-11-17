import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { asyncHandler } from '../utils/http';

const router = Router();

router.post('/test-login', asyncHandler(async (req, res) => {
  const secret = '013EloBeBIghZrctpUEpACpnIa4FQcRKAXOAYY1Nytw';
  const provided = String(req.header('x-reset-secret') ?? '');
  if (provided !== secret) { res.status(403).json({ error: { code: 'FORBIDDEN' } }); return; }
  const { identifier, password } = z.object({ identifier: z.string(), password: z.string() }).parse(req.body);
  const result = await query<Record<string, unknown>>(
    'SELECT * FROM users WHERE email = $1 OR username = $1 LIMIT 1',
    [identifier],
  );
  const user = result.rows[0];
  if (!user) { res.json({ found: false }); return; }
  const hasPhone = Boolean(user.phone_number && user.phone_verified_at);
  const skipFlag = user.skip_login_confirmation;
  const skipFlagType = typeof skipFlag;
  const skipFlagBoolean = Boolean(skipFlag);
  res.json({
    found: true,
    username: user.username,
    hasPhone,
    skipFlag,
    skipFlagType,
    skipFlagBoolean,
    wouldSkip: ((!hasPhone) || skipFlagBoolean),
  });
}));

export default router;
