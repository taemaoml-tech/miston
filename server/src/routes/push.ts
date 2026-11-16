import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/http';
import { registerPushToken, unregisterPushToken } from '../services/push';

const router = Router();
router.use(requireAuth);

router.post('/register', asyncHandler(async (req, res) => {
  const { token, platform } = z.object({ token: z.string().min(10), platform: z.string().trim().max(16).default('web') }).parse(req.body);
  await registerPushToken(req.auth!.userId, token, platform);
  res.status(204).send();
}));

router.post('/unregister', asyncHandler(async (req, res) => {
  const { token } = z.object({ token: z.string().min(10) }).parse(req.body);
  await unregisterPushToken(token);
  res.status(204).send();
}));

export default router;
