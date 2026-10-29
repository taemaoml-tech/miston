import { ScrollText } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { AdminAction, AdminActionLog } from '../../types/models';
import { errorMessage, formatDateTime } from '../../utils/format';
import { ADMIN_ACTION_LABELS, ROLE_LABELS } from '../../utils/moderation';
import { Spinner } from '../common/Spinner';
import { AdminChip, AdminEmpty, AdminNotice, AdminPager, AdminRefreshButton, AdminSectionTitle } from './parts';

const ACTION_ORDER: AdminAction[] = ['user.block', 'user.unblock', 'user.delete', 'user.verify', 'user.unverify', 'star.grant', 'star.remove', 'role.grant', 'role.revoke', 'complaint.status', 'message.delete', 'notification.send'];

export function AuditSection() {
  const [action, setAction] = useState<AdminAction | 'all'>('all');
  const [items, setItems] = useState<AdminActionLog[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(30);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.admin.audit({ action, limit, offset });
      setItems(result.items);
      setTotal(result.total);
      setLimit(result.limit);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [action, limit, offset]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <AdminSectionTitle
        title="Журнал дій"
        hint={`Кожна дія модератора та власника записується сюди · ${total} записів`}
        actions={(
          <>
            <select className="rounded-lg border bg-white px-2 py-1.5 text-xs dark:bg-slate-800" value={action} onChange={(event) => { setAction(event.target.value as AdminAction | 'all'); setOffset(0); }} aria-label="Фільтр дії">
              <option value="all">Усі дії</option>
              {ACTION_ORDER.map((value) => <option key={value} value={value}>{ADMIN_ACTION_LABELS[value]}</option>)}
            </select>
            <AdminRefreshButton onClick={() => void load()} disabled={loading} />
          </>
        )}
      />
      {error && <AdminNotice message={error} onRetry={() => void load()} />}
      {loading ? <Spinner label="Завантаження журналу…" className="py-16" /> : (
        <div className="subtle-scrollbar overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wider text-slate-400 dark:bg-slate-800">
              <tr><th className="px-4 py-3 font-medium">Коли</th><th className="px-4 py-3 font-medium">Дія</th><th className="px-4 py-3 font-medium">Хто</th><th className="px-4 py-3 font-medium">Що</th><th className="px-4 py-3 font-medium">Деталі</th></tr>
            </thead>
            <tbody className="divide-y">
              {items.map((log) => (
                <tr key={log.id} className="bg-white dark:bg-slate-900">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(log.createdAt)}</td>
                  <td className="px-4 py-3"><span className="flex items-center gap-1.5 text-sm font-medium"><ScrollText size={14} className="text-slate-400" />{ADMIN_ACTION_LABELS[log.action]}</span></td>
                  <td className="px-4 py-3 text-sm">{log.actor ? <>{log.actor.displayName} <AdminChip tone={log.actor.role === 'owner' ? 'blue' : 'neutral'}>{ROLE_LABELS[log.actor.role]}</AdminChip></> : <span className="text-xs text-slate-400">видалений акаунт</span>}</td>
                  <td className="px-4 py-3 text-sm">{log.targetUser ? `${log.targetUser.displayName} @${log.targetUser.username}` : log.targetId ? <span className="text-xs text-slate-400">{shorten(log.targetId)}</span> : <span className="text-xs text-slate-400">—</span>}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{summarize(log.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length && <AdminEmpty>Записів у журналі немає.</AdminEmpty>}
        </div>
      )}
      {!!items.length && <AdminPager total={total} limit={limit} offset={offset} onPage={setOffset} />}
    </div>
  );
}

function summarize(details: Record<string, unknown>): string {
  const parts = Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
  return parts.length ? parts.join(' · ') : '—';
}

function shorten(value: string): string {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}
