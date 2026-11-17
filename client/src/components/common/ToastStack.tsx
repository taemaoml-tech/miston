import { Bell, X } from 'lucide-react';
import type { AppNotification } from '../../types/models';

export function ToastStack({ notifications, onDismiss, onOpen }: { notifications: AppNotification[]; onDismiss: (id: string) => void; onOpen: (notification: AppNotification) => void }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
      {notifications.map((notification) => (
        <div key={notification.id} className="ios-glass pointer-events-auto flex items-center gap-3 rounded-[20px] border p-3 shadow-soft animate-toast-in">
          <button type="button" className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left" onClick={() => onOpen(notification)}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ios-blue/10 text-ios-blue"><Bell size={18} /></span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{notification.title}</span>
              {notification.body && <span className="mt-0.5 block truncate text-xs text-ios-secondary">{notification.body}</span>}
            </span>
          </button>
          <button type="button" className="icon-btn h-8 w-8" onClick={() => onDismiss(notification.id)} aria-label="Закрити сповіщення"><X size={16} /></button>
        </div>
      ))}
    </div>
  );
}
