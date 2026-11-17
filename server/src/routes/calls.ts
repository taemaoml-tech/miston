import { Router } from 'express';
import { config } from '../config/env';
import { requireAuth } from '../middleware/auth';
import { getActiveCall } from '../sockets/calls';
import { asyncHandler } from '../utils/http';
import { z } from 'zod';
import { uuid } from '../utils/validation';

const router = Router();
router.use(requireAuth);

router.get('/config', (_req, res) => {
  res.json({ iceServers: config.ICE_SERVERS });
});

router.get('/:id', asyncHandler(async (req, res) => {
  const callId = uuid.parse(req.params.id);
  const call = getActiveCall(callId, req.auth!.userId);
  if (!call) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Дзвінок уже завершено' } });
    return;
  }
  res.json({ call });
}));

export default router;
