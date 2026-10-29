import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config/env';
import { query } from './db/pool';
import { errorHandler, notFoundHandler } from './middleware/error';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import friendRoutes from './routes/friends';
import callRoutes from './routes/calls';
import conversationRoutes from './routes/conversations';
import messageRoutes from './routes/messages';
import serverRoutes from './routes/servers';
import adminRoutes from './routes/admin';
import complaintRoutes from './routes/complaints';
import notificationRoutes from './routes/notifications';
import starRoutes from './routes/star';
import stickerRoutes from './routes/stickers';
import supportRoutes from './routes/support';
import { AppError } from './utils/errors';
import { asyncHandler } from './utils/http';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  if (config.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || config.CORS_ORIGINS.includes('*') || config.CORS_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        // AppError, а не Error: інакше політична відмова виглядає як 500.
        callback(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Цьому origin не дозволено звертатися до API'));
      }
    },
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.get('/health', asyncHandler(async (_req, res) => {
    try {
      await query('SELECT 1');
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  }));

  app.use('/uploads', express.static(config.UPLOAD_DIR, {
    dotfiles: 'deny', index: false, fallthrough: false, maxAge: '1d',
  }));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Забагато спроб входу. Спробуйте пізніше.' } },
  });
  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/friends', friendRoutes);
  app.use('/api/calls', callRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/conversations', messageRoutes);
  app.use('/api/servers', serverRoutes);
  app.use('/api/star', starRoutes);
  app.use('/api/stickers', stickerRoutes);
  app.use('/api/complaints', complaintRoutes);
  app.use('/api/support', supportRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
