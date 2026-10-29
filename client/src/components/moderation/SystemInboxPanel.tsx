import { Bell, CheckCheck, Megaphone, RefreshCw, X } from 'lucide-react';
import { useMessenger } from '../../contexts/MessengerContext';
import { formatDateTime } from '../../utils/format';

export function SystemInboxPanel({ onClose }: { onClose: () => void }) {
  const { systemNotifications, systemUnread, markSystemRead, markAllSystemRead, refreshInbox } = useMessenger();

  return (
    <div className="absolute right-3 top-14 z-40 w-[22rem] max-w-[calc(100%-1.5rem)] overflow-hidden rounded-2xl border bg-white shadow-soft animate-slide-up dark:bg-slate-900" role="dialog" aria-label="Системні сповіщення">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Bell size={16} className="text-accent-500" /> Системні сповіщення{systemUnread > 0 && <span className="rounded-full bg-accent-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{systemUnread > 99 ? '99+' : systemUnread}</span>}</h3>
        <div className="flex items-center gap-1">
          <button type="button" className="icon-btn h-7 w-7" onClick={() => void refreshInbox()} aria-label="Оновити сповіщення"><RefreshCw size={14} /></button>
          <button type="button" className="icon-btn h-7 w-7" onClick={() => void markAllSystemRead()} disabled={systemUnread === 0} aria-label="Позначити всі прочитаними"><CheckCheck size={14} /></button>
          <button type="button" className="icon-btn h-7 w-7" onClick={onClose} aria-label="Закрити сповіщення"><X size={14} /></button>
        </div>
      </div>
      <div className="subtle-scrollbar max-h-96 overflow-y-auto p-2">
        {systemNotifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-slate-400">
            <Megaphone size={22} />
            <p>Адміністрація ще нічого не оголошувала.</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {systemNotifications.map((notification) => (
              <li key={notification.id}>
                <button
                  type="button"
                  onClick={() => void markSystemRead(notification.id)}
                  className={`w-full rounded-xl p-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800 ${notification.readAt ? 'opacity-70' : 'bg-accent-50/60 dark:bg-accent-500/10'}`}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-sm font-semibold">{notification.title}</span>
                    {!notification.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent-500" aria-label="Непрочитане" />}
                  </span>
                  <span className="mt-1 block whitespace-pre-wrap break-words text-xs leading-5 text-slate-600 dark:text-slate-300">{notification.body}</span>
                  <span className="mt-1.5 block text-[11px] text-slate-400">{formatDateTime(notification.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
