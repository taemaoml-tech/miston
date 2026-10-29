import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { listMyComplaints, submitComplaint, submitComplaintSchema } from '../moderation/complaints';
import { asyncHandler } from '../utils/http';

const router = Router();
router.use(requireAuth);

const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });

router.post('/', asyncHandler(async (req, res) => {
  const input = submitComplaintSchema.parse(req.body);
  res.status(201).json({ complaint: await submitComplaint(req.auth!.userId, input) });
}));

router.get('/mine', asyncHandler(async (req, res) => {
  const { limit } = listQuery.parse(req.query);
  res.json({ items: await listMyComplaints(req.auth!.userId, limit) });
}));

export default router;
