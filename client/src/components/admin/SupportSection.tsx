import { CheckCheck, FolderOpen, Inbox } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { AdminCapability, SupportRequest, SupportStatus } from '../../types/models';
import { errorMessage, formatDateTime } from '../../utils/format';
import { COMPLAINT_STATUS_LABELS, SUPPORT_TOPIC_LABELS } from '../../utils/moderation';
import { Avatar } from '../common/Avatar';
import { Spinner } from '../common/Spinner';
import { AdminChip, AdminEmpty, AdminNotice, AdminPager, AdminRefreshButton, AdminSectionTitle } from './parts';

const STATUS_TABS: SupportStatus[] = ['new', 'in_progress', 'closed'];

export function SupportSection({ capabilities, onChanged }: { capabilities: AdminCapability[]; onChanged: () => void }) {
  const [status, setStatus] = useState<SupportStatus | 'all'>('new');
  const [items, setItems] = useState<SupportRequest[]>([]);
  const [counts, setCounts] = useState<Record<SupportStatus, number>>({ new: 0, in_progress: 0, closed: 0 });
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(30);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [replies, setReplies] = useState<Record<string, string>>({});

  const can = (capability: AdminCapability) => capabilities.includes(capability);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.admin.support({ status, limit, offset });
      setItems(result.items);
      setCounts(result.counts);
      setTotal(result.total);
      setLimit(result.limit);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [status, limit, offset]);

  useEffect(() => { void load(); }, [load]);

  async function update(id: string, next: SupportStatus) {
    setBusyId(id);
    setError('');
    try {
      await api.admin.setSupportStatus(id, next, (replies[id] ?? '').trim());
      await load();
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId('');
    }
  }

  return (
    <div>
      <AdminSectionTitle
        title="Звернення до підтримки"
        hint={`Нова: ${counts.new} · В роботі: ${counts.in_progress} · Закрита: ${counts.closed}`}
        actions={(
          <>
            <div className="flex rounded-xl border p-0.5">
              {STATUS_TABS.map((tab) => (
                <button key={tab} type="button" onClick={() => { setStatus(tab); setOffset(0); }}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${status === tab ? 'bg-accent-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                  {COMPLAINT_STATUS_LABELS[tab]}
                </button>
              ))}
              <button type="button" onClick={() => { setStatus('all'); setOffset(0); }} className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${status === 'all' ? 'bg-accent-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>Усі</button>
            </div>
            <AdminRefreshButton onClick={() => void load()} disabled={loading} />
          </>
        )}
      />
      {error && <AdminNotice message={error} onRetry={() => void load()} />}
      {loading ? <Spinner label="Завантаження звернень…" className="py-16" /> : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <AdminChip tone={item.status === 'new' ? 'red' : item.status === 'in_progress' ? 'amber' : 'green'}>{COMPLAINT_STATUS_LABELS[item.status]}</AdminChip>
                <AdminChip tone="neutral">{SUPPORT_TOPIC_LABELS[item.topic]}</AdminChip>
                <span className="text-xs text-slate-400">{formatDateTime(item.createdAt)}</span>
                {item.handledAt && <span className="text-xs text-slate-400">· опрацьовано {formatDateTime(item.handledAt)}</span>}
              </div>

              <div className="mt-3 flex items-center gap-2 text-sm">
                {item.requester ? (
                  <>
                    <Avatar name={item.requester.displayName} src={item.requester.avatarUrl} size="sm" />
                    <p className="min-w-0 truncate font-medium">{item.requester.displayName} <span className="text-xs font-normal text-slate-400">@{item.requester.username}</span></p>
                  </>
                ) : (
                  <p className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><Inbox size={15} /> Гість</p>
                )}
                {(item.contactEmail || item.requester) && <span className="text-xs text-slate-400">· відповідь на {item.contactEmail ?? 'пошту акаунта'}</span>}
              </div>

              <p className="mt-3 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm leading-6 dark:bg-slate-800/60">{item.message}</p>
              {item.resolution && <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">Відповідь: {item.resolution}</p>}

              {item.status !== 'closed' && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {item.status === 'new' && can('complaint.manage') && (
                    <button type="button" className="secondary-btn px-3 py-1.5 text-xs" disabled={busyId === item.id} onClick={() => void update(item.id, 'in_progress')}>
                      <FolderOpen size={14} /> Взяти в роботу
                    </button>
                  )}
                  {can('complaint.manage') && (
                    <>
                      <textarea
                        className="text-input min-h-10 max-w-sm flex-1 py-2 text-sm"
                        placeholder="Відповідь для закриття звернення"
                        maxLength={500}
                        value={replies[item.id] ?? ''}
                        onChange={(event) => setReplies((current) => ({ ...current, [item.id]: event.target.value }))}
                        aria-label="Відповідь на звернення"
                      />
                      <button type="button" className="primary-btn px-3 py-1.5 text-xs" disabled={busyId === item.id} onClick={() => void update(item.id, 'closed')}>
                        <CheckCheck size={14} /> Закрити
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!loading && !items.length && <AdminEmpty>Звернень у цьому статусі немає.</AdminEmpty>}
      {!!items.length && <AdminPager total={total} limit={limit} offset={offset} onPage={setOffset} />}
    </div>
  );
}
