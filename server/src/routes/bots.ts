import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/http';
import { AppError } from '../utils/errors';
import {
  getBotByToken,
  getBotFatherUser,
  listBots,
} from '../services/bots';
import { getMessageById } from '../db/messages';
import { emitMessageNew } from '../sockets/emitter';

const router = Router();

router.get('/bots/father', requireAuth, asyncHandler(async (_req, res) => {
  const father = await getBotFatherUser();
  if (!father) throw new AppError(503, 'BOTFATHER_MISSING', 'Службовий бот BotFather не налаштований.');
  res.json({ user: { id: father.id, username: father.username, displayName: father.displayName } });
}));

router.get('/bots/mine', requireAuth, asyncHandler(async (req, res) => {
  res.json({ bots: await listBots(req.auth!.userId) });
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
