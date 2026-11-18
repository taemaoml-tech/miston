import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import {
  acceptGame, cancelGame, getGameForUser, listGamesForUser, submitScore,
} from '../services/games';
import { asyncHandler } from '../utils/http';
import { GAME_INFO, MAX_GAME_SCORE } from '../types/games';

const router = Router();
router.use(requireAuth);

const paramsSchema = z.object({ id: z.string().uuid() });
const historyQuery = z.object({
  conversationId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
const submitBody = z.object({
  score: z.coerce.number().min(0).max(MAX_GAME_SCORE),
  details: z.record(z.string(), z.unknown()).optional(),
});

router.get('/catalog', (_req, res) => {
  res.json({ games: Object.entries(GAME_INFO).map(([kind, info]) => ({ kind, ...info })) });
});

router.get('/history', asyncHandler(async (req, res) => {
  const { conversationId, limit } = historyQuery.parse(req.query);
  const games = await listGamesForUser(req.auth!.userId, conversationId, limit);
  res.json({ games });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = paramsSchema.parse(req.params);
  const game = await getGameForUser(id, req.auth!.userId);
  res.json({ game });
}));

router.post('/:id/accept', asyncHandler(async (req, res) => {
  const { id } = paramsSchema.parse(req.params);
  const game = await acceptGame(id, req.auth!.userId);
  res.json({ game });
}));

router.post('/:id/cancel', asyncHandler(async (req, res) => {
  const { id } = paramsSchema.parse(req.params);
  const game = await cancelGame(id, req.auth!.userId);
  res.json({ game });
}));

router.post('/:id/submit', asyncHandler(async (req, res) => {
  const { id } = paramsSchema.parse(req.params);
  const { score, details } = submitBody.parse(req.body);
  const game = await submitScore(id, req.auth!.userId, score, details);
  res.json({ game });
}));

export default router;
