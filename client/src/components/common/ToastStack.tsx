import { Bell, X } from 'lucide-react';
import type { AppNotification } from '../../types/models';

export function ToastStack({ notifications, onDismiss, onOpen }: { notifications: AppNotification[]; onDismiss: (id: string) => void; onOpen: (notification: AppNotification) => void }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
      {notifications.map((notification) => (
        <div key={notification.id} className="pointer-events-auto flex items-center gap-3 rounded-2xl border bg-white/95 p-3 shadow-soft backdrop-blur-xl animate-toast-in dark:bg-slate-900/95">
          <button type="button" className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left" onClick={() => onOpen(notification)}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-600 dark:bg-accent-500/10 dark:text-accent-400"><Bell size={18} /></span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{notification.title}</span>
              {notification.body && <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">{notification.body}</span>}
            </span>
          </button>
          <button type="button" className="icon-btn h-8 w-8" onClick={() => onDismiss(notification.id)} aria-label="Закрити сповіщення"><X size={16} /></button>
        </div>
      ))}
    </div>
  );
}
