import crypto from 'node:crypto';
import { query, withTransaction } from '../db/pool';
import { getMessageById } from '../db/messages';
import { listConversations } from '../db/conversations';
import { emitConversationCreated, emitMessageNew } from '../sockets/emitter';

const JOKES = [
  '🤖 Я бот, але теж вмію жартувати: чому програмісти не ходять на пляж? Бо там занадто багато піску в коді.',
  '🎲 Кинув кубик за вас: випало 6! Удачі сьогодні.',
  '🐱 Мяу. Це було повідомлення від бота-кота. Дякую, що прочитали.',
  '☕ Бот працює, кава готова, день вдався.',
  '🚀 Я маленький бот, але мрію про великий космос.',
];

export interface BotRecord {
  id: string;
  userId: string;
  ownerId: string;
  username: string;
  displayName: string;
  description: string;
  token: string;
  avatarUrl: string | null;
  funMode: boolean;
  isActive: boolean;
  createdAt: string;
}

interface BotRow {
  id: string;
  owner_id: string;
  user_id: string;
  username: string;
  display_name: string;
  description: string;
  token: string;
  avatar_url: string | null;
  fun_mode: boolean;
  is_active: boolean;
  created_at: Date;
}

function rowToBot(row: BotRow): BotRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    ownerId: String(row.owner_id),
    username: String(row.username),
    displayName: String(row.display_name),
    description: String(row.description ?? ''),
    token: String(row.token),
    avatarUrl: row.avatar_url == null ? null : String(row.avatar_url),
    funMode: Boolean(row.fun_mode),
    isActive: Boolean(row.is_active),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function getBotFatherUser(): Promise<{ id: string; username: string; displayName: string } | null> {
  const result = await query<{ id: string; username: string; display_name: string }>(
    "SELECT id, username, display_name FROM users WHERE username = 'botfather' AND is_bot = true LIMIT 1",
  );
  const row = result.rows[0];
  if (!row) return null;
  return { id: String(row.id), username: String(row.username), displayName: String(row.display_name) };
}

export async function listBots(ownerId: string): Promise<BotRecord[]> {
  const result = await query<BotRow>('SELECT * FROM bots WHERE owner_id = $1 ORDER BY created_at DESC', [ownerId]);
  return result.rows.map(rowToBot);
}

export async function getBotByToken(token: string): Promise<BotRecord | null> {
  const result = await query<BotRow>('SELECT * FROM bots WHERE token = $1 AND is_active = true', [token]);
  const row = result.rows[0];
  return row ? rowToBot(row) : null;
}

export async function createBot(ownerId: string, displayName: string, username: string): Promise<BotRecord> {
  const cleanUsername = username.trim().toLowerCase();
  if (!cleanUsername.endsWith('bot')) {
    throw new Error('Ім’я користувача бота має завершуватися на «bot» (наприклад, mycoolbot).');
  }
  if (!/^[a-z0-9_]{5,32}$/.test(cleanUsername)) {
    throw new Error('Ім’я користувача: 5–32 символи, лише латиниця, цифри та _.');
  }
  const token = crypto.randomBytes(32).toString('hex');

  // Створюємо акаунт користувача для бота.
  const userResult = await query<{ id: string }>(
    `INSERT INTO users (email, username, display_name, password_hash, role, is_verified, is_bot)
     VALUES ($1, $2, $3, '!bot-no-login', 'user', true, true)
     ON CONFLICT (username) DO UPDATE SET display_name = EXCLUDED.display_name, is_bot = true
     RETURNING id`,
    [`${cleanUsername}@bot.miston.local`, cleanUsername, displayName.trim()],
  );
  const botUserId = userResult.rows[0]?.id;
  if (!botUserId) throw new Error('Не вдалося створити акаунт бота.');

  const result = await query<BotRow>(
    `INSERT INTO bots (owner_id, user_id, username, display_name, token, token_hash)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [ownerId, botUserId, cleanUsername, displayName.trim(), token, crypto.createHash('sha256').update(token).digest('hex')],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Не вдалося створити бота.');
  return rowToBot(row);
}

export async function deleteBot(ownerId: string, username: string): Promise<boolean> {
  const result = await query('DELETE FROM bots WHERE owner_id = $1 AND username = $2 RETURNING id', [ownerId, username.trim().toLowerCase()]);
  return (result.rowCount ?? 0) > 0;
}

export async function setBotFunMode(ownerId: string, username: string, enabled: boolean): Promise<boolean> {
  const result = await query(
    'UPDATE bots SET fun_mode = $3, updated_at = now() WHERE owner_id = $1 AND username = $2 RETURNING id',
    [ownerId, username.trim().toLowerCase(), enabled],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function setBotDescription(ownerId: string, username: string, description: string): Promise<boolean> {
  const result = await query(
    'UPDATE bots SET description = $3, updated_at = now() WHERE owner_id = $1 AND username = $2 RETURNING id',
    [ownerId, username.trim().toLowerCase(), description.trim().slice(0, 500)],
  );
  return (result.rowCount ?? 0) > 0;
}

async function sendBotReply(conversationId: string, botUserId: string, recipientId: string, content: string): Promise<void> {
  const inserted = await query<{ id: string }>(
    `INSERT INTO messages (conversation_id, sender_id, kind, content)
     VALUES ($1, $2, 'text', $3) RETURNING id`,
    [conversationId, botUserId, content],
  );
  const messageId = inserted.rows[0]?.id;
  if (!messageId) return;
  const message = await getMessageById(String(messageId));
  if (message) emitMessageNew(message, [recipientId]);
}

export async function processBotFatherCommand(userId: string, conversationId: string, content: string): Promise<void> {
  const botFather = await getBotFatherUser();
  if (!botFather) return;
  const text = content.trim();
  const lower = text.toLowerCase();

  let reply = '';
  if (lower === '/start' || lower === '/help' || lower === 'help') {
    reply = [
      '🤖 Вітаю в BotFather Miston!',
      '',
      'Команди:',
      '/newbot <Назва> <usernamebot> — створити бота',
      '/mybots — список ваших ботів',
      '/token <usernamebot> — показати API-токен',
      '/deletebot <usernamebot> — видалити бота',
      '/fun <usernamebot> on|off — режим «Веселун» (автовідповіді)',
      '/setdesc <usernamebot> <опис> — опис бота',
      '',
      'Приклад: /newbot МійКіт mykitbot',
    ].join('\n');
  } else if (lower.startsWith('/newbot')) {
    const parts = text.split(/\s+/).slice(1);
    if (parts.length < 2) {
      reply = 'Використання: /newbot <Назва> <usernamebot>\nНаприклад: /newbot МійКіт mykitbot';
    } else {
      const username = parts[parts.length - 1];
      const displayName = parts.slice(0, -1).join(' ');
      try {
        const bot = await createBot(userId, displayName!, username!);
        reply = [
          `✅ Бота створено!`,
          `Назва: ${bot.displayName}`,
          `Username: @${bot.username}`,
          '',
          `🔑 API-токен (збережіть у безпечному місці):`,
          bot.token,
          '',
          'Ендпоінти:',
          `GET  /api/bot/${bot.token}/getMe`,
          `POST /api/bot/${bot.token}/sendMessage  { "chat_id": "<user_id>", "text": "..." }`,
          `GET  /api/bot/${bot.token}/getUpdates`,
        ].join('\n');
      } catch (error) {
        reply = `❌ ${error instanceof Error ? error.message : 'Не вдалося створити бота.'}`;
      }
    }
  } else if (lower === '/mybots') {
    const bots = await listBots(userId);
    if (bots.length === 0) {
      reply = 'У вас ще немає ботів. Створіть: /newbot <Назва> <usernamebot>';
    } else {
      reply = ['Ваші боти:', ...bots.map((bot) => `• @${bot.username} — ${bot.displayName}${bot.funMode ? ' 🎉' : ''}`)].join('\n');
    }
  } else if (lower.startsWith('/token')) {
    const username = text.split(/\s+/)[1];
    if (!username) {
      reply = 'Використання: /token <usernamebot>';
    } else {
      const bots = await listBots(userId);
      const bot = bots.find((item) => item.username === username.toLowerCase());
      reply = bot ? `🔑 Токен @${bot.username}:\n${bot.token}` : 'Бота не знайдено або він не ваш.';
    }
  } else if (lower.startsWith('/deletebot')) {
    const username = text.split(/\s+/)[1];
    if (!username) {
      reply = 'Використання: /deletebot <usernamebot>';
    } else {
      const ok = await deleteBot(userId, username);
      reply = ok ? `🗑 Бота @${username} видалено.` : 'Бота не знайдено або він не ваш.';
    }
  } else if (lower.startsWith('/fun')) {
    const parts = text.split(/\s+/);
    const username = parts[1];
    const mode = parts[2]?.toLowerCase();
    if (!username || (mode !== 'on' && mode !== 'off')) {
      reply = 'Використання: /fun <usernamebot> on|off';
    } else {
      const ok = await setBotFunMode(userId, username, mode === 'on');
      reply = ok
        ? `🎉 Режим «Веселун» для @${username}: ${mode === 'on' ? 'увімкнено' : 'вимкнено'}.`
        : 'Бота не знайдено або він не ваш.';
    }
  } else if (lower.startsWith('/setdesc')) {
    const parts = text.split(/\s+/);
    const username = parts[1];
    const description = parts.slice(2).join(' ');
    if (!username || !description) {
      reply = 'Використання: /setdesc <usernamebot> <опис>';
    } else {
      const ok = await setBotDescription(userId, username, description);
      reply = ok ? `📝 Опис @${username} оновлено.` : 'Бота не знайдено або він не ваш.';
    }
  } else {
    reply = 'Невідома команда. Введіть /help для списку команд.';
  }

  await sendBotReply(conversationId, botFather.id, userId, reply);
}

export async function handleBotInteraction(conversationId: string, message: { id: string; content: string; senderId: string; kind: string }, senderId: string): Promise<void> {
  if (message.kind !== 'text') return;

  // Визначаємо, чи це чат із ботом.
  const members = await query<{ user_id: string; username: string; is_bot: boolean }>(
    `SELECT cm.user_id, u.username, u.is_bot
     FROM conversation_members cm JOIN users u ON u.id = cm.user_id
     WHERE cm.conversation_id = $1`,
    [conversationId],
  );
  const bots = members.rows.filter((row) => row.is_bot && String(row.user_id) !== senderId);
  if (bots.length === 0) return;
  const bot = bots[0]!;
  const botRecordResult = await query<{ id: string; fun_mode: boolean }>('SELECT id, fun_mode FROM bots WHERE username = $1', [bot.username]);
  const botRecord = botRecordResult.rows[0];

  if (botRecord) {
    await query(
      `INSERT INTO bot_updates (bot_id, update_type, payload)
       VALUES ($1, 'message', $2::jsonb)`,
      [botRecord.id, JSON.stringify({ message_id: message.id, from: senderId, text: message.content, date: new Date().toISOString() })],
    ).catch(() => undefined);
  }

  if (String(bot.username) === 'botfather') {
    await processBotFatherCommand(senderId, conversationId, message.content);
    return;
  }

  if (botRecord?.fun_mode) {
    const joke = JOKES[Math.floor(Math.random() * JOKES.length)]!;
    await sendBotReply(conversationId, String(bot!.user_id), senderId, joke);
  }
}
