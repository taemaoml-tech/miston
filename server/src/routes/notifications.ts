import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { listSystemNotifications, markSystemNotificationRead } from '../moderation/notifications';
import { asyncHandler } from '../utils/http';
import { uuid } from '../utils/validation';

const router = Router();
router.use(requireAuth);

const idParams = z.object({ id: uuid });
const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });

router.get('/', asyncHandler(async (req, res) => {
  const { limit } = listQuery.parse(req.query);
  const items = await listSystemNotifications(req.auth!.userId, limit);
  res.json({ items, unread: items.filter((item) => item.readAt === null).length });
}));

router.post('/:id/read', asyncHandler(async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ notification: await markSystemNotificationRead(req.auth!.userId, id) });
}));

export default router;
