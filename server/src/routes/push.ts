import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/http';
import { registerPushToken, unregisterPushToken, sendPushToUser, pushConfigured, pushTokenCount, pushInitError } from '../services/push';

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

router.get('/status', asyncHandler(async (req, res) => {
  res.json({ tokens: await pushTokenCount(req.auth!.userId), configured: pushConfigured(), error: pushInitError() });
}));

router.post('/test', asyncHandler(async (req, res) => {
  const { title, body } = z.object({ title: z.string().default('Miston'), body: z.string().default('Тестове push-сповіщення') }).parse(req.body);
  const result = await sendPushToUser(req.auth!.userId, title, body);
  res.json({ ...result, configured: pushConfigured() });
}));

export default router;
