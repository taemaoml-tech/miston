import type { Request, RequestHandler, Response, NextFunction } from 'express';
import { blockMessage, loadAccount } from '../auth/accounts';
import { AppError, unauthorized } from '../utils/errors';
import { verifyAccessToken } from '../utils/tokens';
import type { AuthContext } from '../types/domain';

export const requireAuth: RequestHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(unauthorized());
    return;
  }

  try {
    const token = header.slice('Bearer '.length).trim();
    if (!token) throw new Error('Порожній токен');
    req.auth = verifyAccessToken(token);
  } catch {
    next(unauthorized('Недійсний або протермінований токен доступу'));
    return;
  }

  try {
    // Роль і статус блокування беруть з бази, а не з токена, щоб пониження,
    // підвищення та блокування діяли відразу, а не після закінчення терміна
    // дії токена доступу.
    const account = await loadAccount(req.auth.userId);
    if (!account) throw unauthorized('Користувача більше не існує');
    if (account.is_blocked) {
      throw new AppError(403, 'ACCOUNT_BLOCKED', blockMessage(account), { userId: account.id });
    }
    const auth: AuthContext = { userId: String(account.id), role: account.role };
    req.auth = auth;
    next();
  } catch (error) {
    next(error);
  }
};
