import type { RequestHandler } from 'express';
import type { AuthContext, UserRole } from '../types/domain';
import { forbidden, unauthorized } from '../utils/errors';

/**
 * Ранг ролі потрібен, щоб модератор не міг діяти на власника: діяти можна
 * лише на акаунт суто нижчого рангу.
 */
export const ROLE_RANK: Record<UserRole, number> = { user: 1, moderator: 2, owner: 3 };

export type AdminCapability =
  | 'panel.open'
  | 'user.view'
  | 'user.block'
  | 'user.delete'
  | 'user.verify'
  | 'star.manage'
  | 'staff.manage'
  | 'stats.view'
  | 'audit.view'
  | 'notification.send'
  | 'complaint.view'
  | 'complaint.manage'
  | 'message.delete';

const MODERATOR_CAPABILITIES: AdminCapability[] = [
  'panel.open', 'user.view', 'user.block', 'user.verify', 'star.manage', 'stats.view',
  'notification.send', 'complaint.view', 'complaint.manage', 'message.delete',
];

const OWNER_CAPABILITIES: AdminCapability[] = [...MODERATOR_CAPABILITIES, 'user.delete', 'staff.manage', 'audit.view'];

const MATRIX: Record<UserRole, readonly AdminCapability[]> = {
  user: [],
  moderator: MODERATOR_CAPABILITIES,
  owner: OWNER_CAPABILITIES,
};

export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'Користувач',
  moderator: 'Модератор',
  owner: 'Власник',
};

export function hasCapability(role: UserRole, capability: AdminCapability): boolean {
  return MATRIX[role].includes(capability);
}

export function isStaffRole(role: UserRole): boolean {
  return role === 'owner' || role === 'moderator';
}

/**
 * Модератор не може керувати акаунтом власника й навпаки — тільки суто вищим
 * рангом, і ніколи власним акаунтом.
 */
export function canManage(actor: AuthContext, targetUserId: string, targetRole: UserRole): boolean {
  return actor.userId !== targetUserId && ROLE_RANK[actor.role] > ROLE_RANK[targetRole];
}

export function assertCanManage(actor: AuthContext, targetUserId: string, targetRole: UserRole): void {
  if (actor.userId === targetUserId) {
    throw forbidden('Не можна виконати цю дію над власним акаунтом');
  }
  if (!canManage(actor, targetUserId, targetRole)) {
    throw forbidden('Недостатньо прав для дій щодо цього акаунта');
  }
}

/**
 * Роль завжди беруть з бази, а не з токена, щоб підвищення чи пониження
 * працювало миттєво. requireAuth вже завантажив актуальний акаунт.
 */
export function requirePermission(capability: AdminCapability): RequestHandler {
  const needsOwner = !MODERATOR_CAPABILITIES.includes(capability);
  return (req, _res, next) => {
    try {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      if (!hasCapability(auth.role, capability)) {
        throw forbidden(needsOwner ? 'Недостатньо прав: потрібні права власника' : 'Недостатньо прав: потрібні права модерації');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
