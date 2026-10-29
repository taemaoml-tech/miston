import { Megaphone, Send } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { SentNotification } from '../../types/models';
import { errorMessage, formatDateTime } from '../../utils/format';
import { AdminEmpty, AdminNotice, AdminRefreshButton, AdminSectionTitle } from './parts';

export function NotificationsSection({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<SentNotification[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.admin.sentNotifications(20);
      setItems(result.items);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setSending(true);
    setError('');
    try {
      await api.admin.sendNotification(title.trim(), body.trim());
      setTitle('');
      setBody('');
      await load();
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <AdminSectionTitle
        title="Системні сповіщення"
        hint="Повідомлення зʼявляється у всіх користувачів одразу через Socket.io"
        actions={<AdminRefreshButton onClick={() => void load()} disabled={loading} />}
      />
      {error && <AdminNotice message={error} onRetry={() => void load()} />}
      <form onSubmit={(event) => void send(event)} className="rounded-2xl border p-4">
        <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Megaphone size={16} className="text-accent-600" />Нове сповіщення</h4>
        <label className="field-label block" htmlFor="notif-title">Заголовок</label>
        <input id="notif-title" className="text-input mb-3" maxLength={120} required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Напр. «Технічні роботи о 22:00»" />
        <label className="field-label block" htmlFor="notif-body">Текст</label>
        <textarea id="notif-body" className="text-input min-h-24 resize-y" maxLength={1000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Коротко поясніть, що змінилось (необовʼязково)" />
        <button type="submit" className="primary-btn mt-3" disabled={sending || !title.trim()}><Send size={16} />Надіслати всім</button>
      </form>

      <h4 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-slate-400">Останні розсилки</h4>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border p-3">
            <p className="text-sm font-medium">{item.title}</p>
            {item.body && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.body}</p>}
            <p className="mt-1 text-xs text-slate-400">{formatDateTime(item.createdAt)} · адресатів: {item.recipients} · прочитали: {item.read}</p>
          </li>
        ))}
      </ul>
      {!loading && !items.length && <AdminEmpty>Сповіщень ще не надсилали.</AdminEmpty>}
    </div>
  );
}
