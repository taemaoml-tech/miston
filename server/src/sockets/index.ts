import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { query } from '../db/pool';
import { uuid } from '../utils/validation';
import { socketAuth } from './auth';
import { handleCallDisconnect, registerCallHandlers } from './calls';
import { setSocketServer } from './emitter';
import { connectPresence, disconnectPresence, getOnlineUserIds } from './presence';

const joinSchema = z.object({ conversationId: uuid });
const typingSchema = z.object({ conversationId: uuid, isTyping: z.boolean() });

function userIdOf(socket: Socket): string {
  return String(socket.data.auth.userId);
}

function socketError(socket: Socket, event: string, message: string): void {
  socket.emit('event:error', { event, message });
}

async function joinConversationRooms(socket: Socket): Promise<void> {
  const result = await query<{ conversation_id: string }>(
    'SELECT conversation_id FROM conversation_members WHERE user_id = $1',
    [userIdOf(socket)],
  );
  await socket.join([
    `user:${userIdOf(socket)}`,
    ...result.rows.map((row) => `conversation:${row.conversation_id}`),
  ]);
}

function broadcastPresence(socket: Socket, rooms: string[], isOnline: boolean, lastSeenAt?: Date): void {
  for (const room of rooms) {
    socket.to(room).emit('presence', {
      userId: userIdOf(socket),
      isOnline,
      ...(lastSeenAt ? { lastSeenAt: lastSeenAt.toISOString() } : {}),
    });
  }
}

export function registerSockets(io: Server): void {
  setSocketServer(io);
  io.use(socketAuth);

  io.on('connection', async (socket) => {
    const userId = userIdOf(socket);
    try {
      await joinConversationRooms(socket);
    } catch {
      socket.disconnect(true);
      return;
    }

    const becameOnline = connectPresence(userId);
    // A fresh client has no knowledge of users who connected earlier, so send a
    // compact presence snapshot after its conversation rooms are joined.
    socket.emit('presence:snapshot', { userIds: getOnlineUserIds() });
    if (becameOnline) {
      broadcastPresence(socket, [...socket.rooms], true);
    }

    socket.on('conversation:join', async (payload: unknown) => {
      try {
        const { conversationId } = joinSchema.parse(payload);
        const membership = await query(
          'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
          [conversationId, userId],
        );
        if (membership.rowCount === 0) {
          socketError(socket, 'conversation:join', 'Потрібне членство в розмові');
          return;
        }
        await socket.join(`conversation:${conversationId}`);
      } catch {
        socketError(socket, 'conversation:join', 'Некоректний запит приєднання до розмови');
      }
    });

    registerCallHandlers(io, socket, userId);

    socket.on('typing', (payload: unknown) => {
      try {
        const { conversationId, isTyping } = typingSchema.parse(payload);
        const room = `conversation:${conversationId}`;
        if (!socket.rooms.has(room)) {
          socketError(socket, 'typing', 'Спершу приєднайтеся до розмови');
          return;
        }
        socket.to(room).emit('typing', { conversationId, userId, isTyping });
      } catch {
        socketError(socket, 'typing', 'Некоректна подія набору тексту');
      }
    });

    let relevantRooms: string[] = [];
    socket.on('disconnecting', () => {
      relevantRooms = [...socket.rooms];
    });

    socket.on('disconnect', () => {
      handleCallDisconnect(io, socket.id);
      if (!disconnectPresence(userId)) return;
      const lastSeenAt = new Date();
      query('UPDATE users SET last_seen_at = $2, updated_at = now() WHERE id = $1', [userId, lastSeenAt])
        .catch((error) => console.error('Failed to update last seen timestamp', error));
      broadcastPresence(socket, relevantRooms, false, lastSeenAt);
    });
  });
}
