import type { AdminAction, ComplaintCategory, ComplaintStatus, SupportTopic, UserRole } from '../types/models';

export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'Користувач',
  moderator: 'Модератор',
  owner: 'Власник',
};

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  new: 'Нова',
  in_progress: 'В роботі',
  closed: 'Закрита',
};

export const COMPLAINT_CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  spam: 'Спам',
  harassment: 'Переслідування',
  nsfw: 'Заборонений контент',
  scam: 'Шахрайство',
  copyright: 'Порушення авторських прав',
  other: 'Інше',
};

export const SUPPORT_TOPIC_LABELS: Record<SupportTopic, string> = {
  account: 'Акаунт і доступ',
  technical: 'Технічна проблема',
  report: 'Порушення правил',
  star: 'Star і магазин',
  feedback: 'Ідея чи відгук',
  other: 'Інше',
};

export const ADMIN_ACTION_LABELS: Record<AdminAction, string> = {
  'user.block': 'Блокування акаунта',
  'user.unblock': 'Розблокування акаунта',
  'user.delete': 'Видалення акаунта',
  'user.verify': 'Видача галочки',
  'user.unverify': 'Зняття галочки',
  'star.grant': 'Нарахування Star',
  'star.remove': 'Списання Star',
  'role.grant': 'Видача ролі',
  'role.revoke': 'Відкликання ролі',
  'complaint.status': 'Зміна статусу скарги',
  'message.delete': 'Видалення повідомлення',
  'notification.send': 'Системне сповіщення',
  'support.status': 'Опрацювання звернення',
};

export function isStaffRole(role: UserRole | undefined): boolean {
  return role === 'owner' || role === 'moderator';
}

export function blockLabel(blockedUntil?: string | null): string {
  if (!blockedUntil) return 'Безстроково';
  return `до ${formatShortDate(blockedUntil)}`;
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
