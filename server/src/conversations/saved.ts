import type { ConversationKind } from '../types/domain';

/** Нотатки — розмова на одну людину, тому всюди, де «direct» означає «не група», підходять і вони. */
export function isSoloConversation(kind: ConversationKind): boolean {
  return kind === 'direct' || kind === 'saved';
}

/** Ключ покриває «одні нотатки на користувача» через UNIQUE на direct_key. */
export function savedConversationKey(userId: string): string {
  return `saved:${userId}`;
}

/** Назви в БД немає (форма 'saved' вимагає title IS NULL), тому заголовок подає сервер. */
export const SAVED_CONVERSATION_TITLE = 'Збережені нотатки';
