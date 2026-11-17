import { Inbox, MailOpen } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { Spinner } from '../common/Spinner';

interface MistIdMessage {
  id: string;
  title: string;
  body: string;
  kind: string;
  read: boolean;
  createdAt: string;
}

export function MistIdInbox() {
  const [items, setItems] = useState<MistIdMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.mistInbox.list();
      setItems(result.items);
      setUnread(result.unread);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function markRead(id: string) {
    try {
      await api.mistInbox.markRead(id);
      setItems((current) => current.map((item) => item.id === id ? { ...item, read: true } : item));
      setUnread((n) => Math.max(0, n - 1));
    } catch { /* ignore */ }
  }

  async function markAllRead() {
    try {
      await api.mistInbox.markAllRead();
      setItems((current) => current.map((item) => ({ ...item, read: true })));
      setUnread(0);
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <Inbox size={16} className="text-accent-500" /> Пошта Mist ID
          {unread > 0 && <span className="rounded-full bg-accent-600 px-2 py-0.5 text-[10px] font-bold text-white">{unread}</span>}
        </p>
        {unread > 0 && (
          <button type="button" className="text-xs text-accent-600 hover:underline dark:text-accent-400" onClick={() => void markAllRead()}>
            Прочитати всі
          </button>
        )}
      </div>
      {loading ? <Spinner label="Завантаження…" className="py-8" /> : error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400 dark:border-slate-700">
          <MailOpen size={24} className="mx-auto mb-2 opacity-40" />
          Вхідних повідомлень ще немає
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => void markRead(item.id)} className={`w-full rounded-2xl border p-3 text-left transition ${item.read ? 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900' : 'border-accent-200 bg-accent-50 dark:border-accent-500/30 dark:bg-accent-950/30'}`}>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{item.title}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500 dark:text-slate-400">{item.body}</p>
                <p className="mt-1.5 text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleString('uk-UA')}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
