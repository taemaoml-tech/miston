import { config } from '../config/env';
import { query } from '../db/pool';
import { isUserOnline } from '../sockets/presence';
import type { Message, MessageKind } from '../types/domain';
import { sendSms } from './sms';
import { sendPushToUser } from './push';

/** Як людські читається тип повідомлення в SMS. */
const KIND_LABELS: Record<MessageKind, string> = {
  text: 'текст',
  image: 'фото',
  video: 'відео',
  video_note: 'кружок',
  document: 'файл',
  voice: 'голосове повідомлення',
  sticker: 'стікер',
  game: 'гра',
};

interface RecipientRow {
  id: string;
  phone_number: string | null;
  phone_verified_at: Date | null;
  sms_notifications_enabled: boolean;
}

interface ConversationRow {
  kind: string;
  title: string | null;
}

/** Скорочений опис вмісту повідомлення: «фото», «кружок» або частина тексту. */
export function describeMessage(message: Message): string {
  // Шифротекст не можна показувати в SMS/push — навіть сам сервер не знає,
  // що саме написав користувач.
  if (message.encrypted) return 'шифроване повідомлення';
  if (message.kind === 'text') {
    const text = message.content.trim().replace(/\s+/g, ' ');
    if (!text) return 'нове повідомлення';
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  }
  return KIND_LABELS[message.kind] ?? 'нове повідомлення';
}

/** Текст SMS: «Miston: Артем: фото» або «Miston: Артем у «Чат»: фото». */
export function buildSmsText(message: Message, conversation: ConversationRow | null): string {
  const sender = message.sender.displayName || message.sender.username || 'Хтось';
  const content = describeMessage(message);
  const isGroup = conversation?.kind === 'group' || conversation?.kind === 'channel';
  const where = isGroup && conversation?.title ? ` у «${conversation.title}»` : '';
  if (message.kind === 'text') {
    return `Miston: ${sender}${where}: ${content}`;
  }
  return `Miston: ${sender}${where} надіслав(ла) ${content}`;
}

/**
 * Чи варто зараз надсилати SMS одному з отримувачів:
 * - користувач offline, або він онлайн, але не відповідав у розмові вже понад SMS_NOTIFY_IDLE_MINUTES.
 */
export async function shouldNotify(recipientId: string, conversationId: string): Promise<boolean> {
  if (!isUserOnline(recipientId)) return true;

  const idleMinutes = config.SMS_NOTIFY_IDLE_MINUTES;
  if (idleMinutes <= 0) return false;

  const last = await query<{ created_at: Date }>(
    `SELECT created_at FROM messages
     WHERE conversation_id = $1 AND sender_id = $2 AND deleted_at IS NULL
     ORDER BY id DESC LIMIT 1`,
    [conversationId, recipientId],
  );
  const createdAt = last.rows[0]?.created_at;
  if (!createdAt) return false;
  return Date.now() - new Date(createdAt).getTime() >= idleMinutes * 60_000;
}

/** Не більше одного SMS в ту саму розмову за SMS_NOTIFY_THROTTLE_MINUTES. */
async function passesThrottle(userId: string, conversationId: string): Promise<boolean> {
  const minutes = config.SMS_NOTIFY_THROTTLE_MINUTES;
  if (minutes <= 0) return true;
  const recent = await query<{ created_at: Date }>(
    `SELECT created_at FROM sms_notification_log
     WHERE user_id = $1 AND conversation_id = $2 AND created_at > now() - make_interval(mins => $3)
     LIMIT 1`,
    [userId, conversationId, minutes],
  );
  return recent.rowCount === 0;
}

/** Денний ліміт SMS на користувача (0 — без ліміту). */
async function passesDailyLimit(userId: string): Promise<boolean> {
  const limit = config.SMS_NOTIFY_MAX_PER_DAY;
  if (limit <= 0) return true;
  const today = await query<{ count: number }>(
    `SELECT count(*)::int AS count FROM sms_notification_log
     WHERE user_id = $1 AND created_at > now() - interval '1 day'`,
    [userId],
  );
  return (today.rows[0]?.count ?? 0) < limit;
}

/**
 * Надсилає SMS про нове повідомлення тим, хто цього хоче і кого немає онлайн.
 * Усі помилки ковтаються: збій SMS не повинен ламати надсилання повідомлення.
 */
export async function notifyRecipientsBySms(message: Message, recipientIds: string[]): Promise<void> {
  if (recipientIds.length === 0) return;

  try {
    const conversationResult = await query<ConversationRow>(
      'SELECT kind, title FROM conversations WHERE id = $1',
      [message.conversationId],
    );
    const conversation = conversationResult.rows[0] ?? null;
    // Нотатки « собі» не сповіщаємо.
    if (conversation?.kind === 'saved') return;

    const recipients = await query<RecipientRow>(
      `SELECT id, phone_number, phone_verified_at, sms_notifications_enabled
       FROM users WHERE id = ANY($1::uuid[])`,
      [recipientIds],
    );

    for (const recipient of recipients.rows) {
      try {
        if (!recipient.sms_notifications_enabled) continue;
        if (!recipient.phone_number || !recipient.phone_verified_at) continue;
        if (!(await shouldNotify(recipient.id, message.conversationId))) continue;
        if (!(await passesThrottle(recipient.id, message.conversationId))) continue;
        if (!(await passesDailyLimit(recipient.id))) continue;

        await sendSms(recipient.phone_number, buildSmsText(message, conversation));
        await query(
          'INSERT INTO sms_notification_log (user_id, conversation_id, message_id) VALUES ($1, $2, $3)',
          [recipient.id, message.conversationId, message.id],
        );
      } catch (error) {
        console.error('Failed to send the message SMS', error instanceof Error ? error.message : error);
      }
    }

  } catch (error) {
    console.error('Failed to prepare the message SMS', error instanceof Error ? error.message : error);
  }
}

export async function notifyRecipientsByPush(message: Message, recipientIds: string[]): Promise<void> {
  if (recipientIds.length === 0) return;
  try {
    const conversationResult = await query<{ kind: string; title: string | null }>(
      'SELECT kind, title FROM conversations WHERE id = $1',
      [message.conversationId],
    );
    const conversation = conversationResult.rows[0] ?? null;
    if (conversation?.kind === 'saved') return;

    const recipients = await query<{ id: string }>(
      'SELECT id FROM users WHERE id = ANY($1::uuid[])',
      [recipientIds],
    );

    const text = buildSmsText(message, conversation).replace(/^Miston: /, '');
    const title = 'Miston';

    // Push надсилаємо завжди, незалежно від presence: застосунок у фоні або
    // закритий не має живого сокета, і саме push — єдиний спосіб розбудити
    // пристрій. Показ сповіщення вирішує ОС / service worker.
    for (const recipient of recipients.rows) {
      try {
        await sendPushToUser(recipient.id, title, text, {
          conversationId: message.conversationId,
          messageId: message.id,
        });
      } catch (error) {
        console.error('Failed to send push notification', error instanceof Error ? error.message : error);
      }
    }
  } catch (error) {
    console.error('Failed to prepare push notification', error instanceof Error ? error.message : error);
  }
}
