import type { Socket } from 'socket.io';
import { z } from 'zod';
import { blockMessage, loadAccount } from '../auth/accounts';
import { verifyAccessToken } from '../utils/tokens';

export async function socketAuth(socket: Socket, next: (error?: Error) => void): Promise<void> {
  try {
    const token = z.string().min(1).parse(socket.handshake.auth.token);
    const auth = verifyAccessToken(token);
    const account = await loadAccount(auth.userId);
    if (!account) throw new Error('Користувача більше не існує');
    if (account.is_blocked) throw new Error(blockMessage(account));
    socket.data.auth = { userId: auth.userId, role: account.role };
    next();
  } catch (error) {
    const wrapped = new Error(error instanceof Error ? error.message : 'Недійсний або протермінований токен доступу');
    wrapped.name = 'UnauthorizedError';
    next(wrapped);
  }
}
