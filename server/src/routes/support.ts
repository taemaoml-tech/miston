import { Router } from 'express';
import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth';
import {
  createSupportRequest,
  createSupportSchema,
  listMySupportRequests,
  supportQuerySchema,
} from '../moderation/support';
import { AppError } from '../utils/errors';
import { asyncHandler } from '../utils/http';
import { verifyAccessToken } from '../utils/tokens';

const router = Router();

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Забагато звернень. Спробуйте пізніше.' } },
});

/**
 * Звернення пишуть і гості, тому токен лише уточнює автора. Невірний токен
 * не блокує подання, а сприймається як анонімна заявка.
 */
const optionalAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      req.auth = verifyAccessToken(header.slice('Bearer '.length).trim());
    } catch {
      delete req.auth;
    }
  }
  next();
};

router.post('/', optionalAuth, writeLimiter, asyncHandler(async (req, res) => {
  const input = createSupportSchema.parse(req.body);
  if (!req.auth && !input.contactEmail) {
    throw new AppError(400, 'CONTACT_REQUIRED', 'Вкажіть електронну пошту, щоб ми могли відповісти');
  }
  res.status(201).json({ request: await createSupportRequest(req.auth ?? null, input) });
}));

router.get('/mine', requireAuth, asyncHandler(async (req, res) => {
  const { limit } = supportQuerySchema.parse({ ...req.query, status: 'all' });
  res.json({ items: await listMySupportRequests(req.auth!.userId, limit) });
}));

export default router;
