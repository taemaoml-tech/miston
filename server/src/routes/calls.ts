import { Router } from 'express';
import { config } from '../config/env';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/config', (_req, res) => {
  res.json({ iceServers: config.ICE_SERVERS });
});

export default router;
