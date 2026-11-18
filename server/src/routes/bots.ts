import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/http';
import { AppError } from '../utils/errors';
import {
  deleteBot,
  getBotByToken,
  getBotFatherUser,
  listBots,
  setBotDescription,
  setBotFunMode,
} from '../services/bots';
import { getMessageById } from '../db/messages';
import { emitMessageNew } from '../sockets/emitter';

const router = Router();

const botWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Забагато операцій з ботами. Спробуйте пізніше.' } },
});

router.get('/bots/father', requireAuth, asyncHandler(async (_req, res) => {
  const father = await getBotFatherUser();
  if (!father) throw new AppError(503, 'BOTFATHER_MISSING', 'Службовий бот BotFather не налаштований.');
  res.json({ user: { id: father.id, username: father.username, displayName: father.displayName } });
}));

router.get('/bots/mine', requireAuth, asyncHandler(async (req, res) => {
  res.json({ bots: await listBots(req.auth!.userId) });
}));

// Підключення бота за токеном, отриманим від BotFather (або з чату з ним).
router.post('/bots/connect', botWriteLimiter, requireAuth, asyncHandler(async (req, res) => {
  const { token } = z.object({ token: z.string().trim().min(20).max(200) }).parse(req.body);
  const bot = await getBotByToken(token);
  if (!bot) throw new AppError(404, 'INVALID_BOT_TOKEN', 'Невірний або неактивний токен бота.');
  if (bot.ownerId !== req.auth!.userId) {
    await query('UPDATE bots SET owner_id = $2, updated_at = now() WHERE id = $1', [bot.id, req.auth!.userId]);
    bot.ownerId = req.auth!.userId;
  }
  res.json({ bot });
}));

async function assertBotOwner(username: string, userId: string): Promise<void> {
  const result = await query<{ owner_id: string }>('SELECT owner_id FROM bots WHERE username = $1', [username.trim().toLowerCase()]);
  if (!result.rows[0]) throw new AppError(404, 'BOT_NOT_FOUND', 'Бота не знайдено.');
  if (String(result.rows[0].owner_id) !== userId) throw new AppError(403, 'NOT_BOT_OWNER', 'Цей бот належить іншому користувачу.');
}

router.patch('/bots/:username', botWriteLimiter, requireAuth, asyncHandler(async (req, res) => {
  const username = String(req.params.username).trim().toLowerCase();
  await assertBotOwner(username, req.auth!.userId);
  const { funMode, description, displayName } = z.object({
    funMode: z.boolean().optional(),
    description: z.string().trim().max(500).optional(),
    displayName: z.string().trim().min(1).max(80).optional(),
  }).parse(req.body);
  if (funMode === undefined && description === undefined && displayName === undefined) {
    throw new AppError(400, 'NO_CHANGES', 'Немає змін для збереження.');
  }
  if (funMode !== undefined) await setBotFunMode(req.auth!.userId, username, funMode);
  if (description !== undefined) await setBotDescription(req.auth!.userId, username, description);
  if (displayName !== undefined) {
    await query('UPDATE bots SET display_name = $3, updated_at = now() WHERE owner_id = $1 AND username = $2', [req.auth!.userId, username, displayName]);
  }
  const bot = (await listBots(req.auth!.userId)).find((item) => item.username === username);
  if (!bot) throw new AppError(404, 'BOT_NOT_FOUND', 'Бота не знайдено.');
  res.json({ bot });
}));

router.delete('/bots/:username', botWriteLimiter, requireAuth, asyncHandler(async (req, res) => {
  const username = String(req.params.username).trim().toLowerCase();
  await assertBotOwner(username, req.auth!.userId);
  if (!await deleteBot(req.auth!.userId, username)) throw new AppError(404, 'BOT_NOT_FOUND', 'Бота не знайдено.');
  res.json({ ok: true });
}));

// ---- Bot API (авторизація за токеном у шляху) ----

router.get('/bot/:token/getMe', asyncHandler(async (req, res) => {
  const bot = await getBotByToken(String(req.params.token));
  if (!bot) throw new AppError(401, 'INVALID_BOT_TOKEN', 'Невірний токен бота.');
  res.json({ ok: true, result: { id: bot.id, username: bot.username, first_name: bot.displayName } });
}));

router.post('/bot/:token/sendMessage', asyncHandler(async (req, res) => {
  const bot = await getBotByToken(String(req.params.token));
  if (!bot) throw new AppError(401, 'INVALID_BOT_TOKEN', 'Невірний токен бота.');
  const { chat_id, text } = z.object({ chat_id: z.string().min(1), text: z.string().min(1).max(4000) }).parse(req.body);

  // chat_id — id користувача, з яким у бота є (або створюється) особистий чат.
  const conversationId = await (async () => {
    const key = [bot.userId, chat_id].sort().join(':');
    const existing = await query<{ id: string }>('SELECT id FROM conversations WHERE direct_key = $1', [key]);
    if (existing.rows[0]) return String(existing.rows[0].id);
    const created = await query<{ id: string }>(
      `INSERT INTO conversations (kind, direct_key, created_by) VALUES ('direct', $1, $2) RETURNING id`,
      [key, bot.userId],
    );
    const id = created.rows[0]?.id;
    if (!id) throw new Error('conversation create failed');
    await query(
      `INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2), ($1, $3) ON CONFLICT DO NOTHING`,
      [id, bot.userId, chat_id],
    );
    return String(id);
  })();

  const inserted = await query<{ id: string }>(
    `INSERT INTO messages (conversation_id, sender_id, kind, content) VALUES ($1, $2, 'text', $3) RETURNING id`,
    [conversationId, bot.userId, text],
  );
  const messageId = inserted.rows[0]?.id;
  const message = messageId ? await getMessageById(String(messageId)) : null;
  if (message) emitMessageNew(message, [chat_id]);
  res.json({ ok: true, result: { message_id: messageId } });
}));

router.get('/bot/:token/getUpdates', asyncHandler(async (req, res) => {
  const bot = await getBotByToken(String(req.params.token));
  if (!bot) throw new AppError(401, 'INVALID_BOT_TOKEN', 'Невірний токен бота.');
  const result = await query<{ id: string; payload: unknown; created_at: Date }>(
    `SELECT id, payload, created_at FROM bot_updates
     WHERE bot_id = $1 AND consumed = false
     ORDER BY id ASC LIMIT 100`,
    [bot.id],
  );
  const ids = result.rows.map((row) => row.id);
  if (ids.length > 0) {
    await query('UPDATE bot_updates SET consumed = true WHERE id = ANY($1::bigint[])', [ids]);
  }
  res.json({
    ok: true,
    result: result.rows.map((row) => ({
      update_id: Number(row.id),
      ...((row.payload as Record<string, unknown>) ?? {}),
    })),
  });
}));

export default router;
