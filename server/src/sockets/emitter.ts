import type { Server } from 'socket.io';
import type { FriendshipEvent, Message, StarUpdate, SystemNotification } from '../types/domain';

let io: Server | undefined;

export function setSocketServer(server: Server): void {
  io = server;
}

export function emitMessageNew(message: Message, recipientIds: string[]): void {
  if (!io) return;
  io.to(`conversation:${message.conversationId}`).emit('message:new', { message });
  for (const userId of recipientIds) {
    io.to(`user:${userId}`).emit('notification', {
      type: 'message',
      conversationId: message.conversationId,
      message,
    });
  }
}

export function emitMessageRead(conversationId: string, messageId: string, userId: string): void {
  io?.to(`conversation:${conversationId}`).emit('message:read', { conversationId, messageId, userId });
}

export function emitMention(message: Message, mentionedIds: string[]): void {
  if (!io || mentionedIds.length === 0) return;
  const preview = message.content.trim().slice(0, 140) || 'Вкладення';
  for (const userId of mentionedIds) {
    io.to(`user:${userId}`).emit('notification', {
      type: 'mention',
      title: `${message.sender.displayName} згадав(ла) вас`,
      body: preview,
      conversationId: message.conversationId,
      message,
    });
  }
}

export function emitMessageUpdated(message: Message): void {
  io?.to(`conversation:${message.conversationId}`).emit('message:updated', { message });
}

export function emitMessageReactions(message: Message): void {
  io?.to(`conversation:${message.conversationId}`).emit('message:reactions', { message });
}

export function emitMessageDeleted(conversationId: string, messageId: string): void {
  io?.to(`conversation:${conversationId}`).emit('message:deleted', { conversationId, messageId });
}

export function emitConversationCreated(conversation: { id: string }, memberIds: string[]): void {
  if (!io) return;
  const room = `conversation:${conversation.id}`;
  // Make already-connected recipients receive the first message without a reload.
  io.in(memberIds.map((userId) => `user:${userId}`)).socketsJoin(room);
  for (const userId of memberIds) {
    io.to(`user:${userId}`).emit('notification', { type: 'conversation', conversation });
  }
}

/** Історію очищено: «me» стосується лише автора дії, «everyone» — усієї розмови. */
export function emitConversationCleared(conversationId: string, scope: 'me' | 'everyone'): void {
  if (scope !== 'everyone') return;
  io?.to(`conversation:${conversationId}`).emit('conversation:cleared', { conversationId, scope });
}

export function emitConversationDeleted(conversationId: string, memberIds: string[]): void {
  if (!io) return;
  io.to(`conversation:${conversationId}`).emit('conversation:deleted', { conversationId });
  for (const userId of memberIds) {
    io.to(`user:${userId}`).emit('notification', { type: 'refresh' });
  }
}

export function joinUserToConversationRooms(userId: string, conversationIds: string[]): void {
  if (!io || conversationIds.length === 0) return;
  io.in(`user:${userId}`).socketsJoin(conversationIds.map((id) => `conversation:${id}`));
}

export function notifyUserRefresh(userId: string): void {
  io?.to(`user:${userId}`).emit('notification', { type: 'refresh' });
}

export function emitFriendshipChanged(userId: string, event: FriendshipEvent): void {
  io?.to(`user:${userId}`).emit('friends:changed', event);
}

export function emitStarUpdate(userId: string, update: StarUpdate): void {
  io?.to(`user:${userId}`).emit('star:update', update);
}

export function emitSystemNotification(notification: SystemNotification): void {
  io?.emit('system:notification', { notification });
}

/** Розриває сесії користувача й пояснює причину — для блокування та видалення акаунта. */
export async function forceUserLogout(userId: string, event: 'account:blocked' | 'account:deleted'): Promise<void> {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, { userId });
  const sockets = await io.in(`user:${userId}`).fetchSockets();
  for (const socket of sockets) socket.disconnect(true);
}
