import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/http';
import { emergencyResetPasswordByPhone } from '../moderation/service';

const router = Router();

router.post('/reset-password', asyncHandler(async (req, res) => {
  const secret = process.env.EMERGENCY_RESET_SECRET;
  if (!secret) throw new Error('EMERGENCY_RESET_SECRET is not configured');
  const provided = String(req.header('x-reset-secret') ?? req.body?.secret ?? '');
  if (provided.length !== secret.length || !timingSafeEqual(provided, secret)) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Невірний секрет' } });
    return;
  }
  const { phone } = z.object({ phone: z.string().trim().min(5).max(30) }).parse(req.body);
  const result = await emergencyResetPasswordByPhone(phone);
  res.json(result);
}));

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let index = 0; index < bufA.length; index += 1) diff |= bufA[index]! ^ bufB[index]!;
  return diff === 0;
}

export default router;
