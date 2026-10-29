import { CheckCheck, FolderOpen, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { AdminCapability, Complaint, ComplaintCategory, ComplaintStatus } from '../../types/models';
import { errorMessage, formatDateTime } from '../../utils/format';
import { COMPLAINT_CATEGORY_LABELS, COMPLAINT_STATUS_LABELS } from '../../utils/moderation';
import { Avatar } from '../common/Avatar';
import { Spinner } from '../common/Spinner';
import { AdminChip, AdminEmpty, AdminNotice, AdminPager, AdminRefreshButton, AdminSectionTitle } from './parts';

const STATUS_TABS: ComplaintStatus[] = ['new', 'in_progress', 'closed'];

export function ComplaintsSection({ capabilities, onChanged }: { capabilities: AdminCapability[]; onChanged: () => void }) {
  const [status, setStatus] = useState<ComplaintStatus | 'all'>('new');
  const [category, setCategory] = useState<ComplaintCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<Complaint[]>([]);
  const [counts, setCounts] = useState<Record<ComplaintStatus, number>>({ new: 0, in_progress: 0, closed: 0 });
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(30);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [resolutions, setResolutions] = useState<Record<string, string>>({});

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebounced(query.trim()); setOffset(0); }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.admin.complaints({ status, category, q: debounced || undefined, limit, offset });
      setItems(result.items);
      setCounts(result.counts);
      setTotal(result.total);
      setLimit(result.limit);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [status, category, debounced, limit, offset]);

  useEffect(() => { void load(); }, [load]);

  async function update(complaint: Complaint, next: ComplaintStatus) {
    setBusyId(complaint.id);
    setError('');
    try {
      await api.admin.setComplaintStatus(complaint.id, next, (resolutions[complaint.id] ?? '').trim());
      await load();
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId('');
    }
  }

  const can = (capability: AdminCapability) => capabilities.includes(capability);

  async function removeMessage(complaint: Complaint) {
    if (!complaint.messageId) return;
    if (!window.confirm('Видалити це повідомлення? Дія потрапить до журналу модератора.')) return;
    setBusyId(complaint.id);
    setError('');
    try {
      await api.admin.deleteMessage(complaint.messageId);
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
        title="Скарги"
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
            <select className="rounded-lg border bg-white px-2 py-1.5 text-xs dark:bg-slate-800" value={category} onChange={(event) => { setCategory(event.target.value as ComplaintCategory | 'all'); setOffset(0); }} aria-label="Фільтр категорії">
              <option value="all">Усі категорії</option>
              {Object.entries(COMPLAINT_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <div className="relative"><Search size={14} className="absolute left-3 top-2.5 text-slate-400" /><input className="text-input py-1.5 pl-8 sm:w-44" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Пошук" aria-label="Пошук скарг" /></div>
            <AdminRefreshButton onClick={() => void load()} disabled={loading} />
          </>
        )}
      />
      {error && <AdminNotice message={error} onRetry={() => void load()} />}
      {loading ? <Spinner label="Завантаження скарг…" className="py-16" /> : (
        <ul className="space-y-3">
          {items.map((complaint) => (
            <li key={complaint.id} className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <AdminChip tone={complaint.status === 'new' ? 'red' : complaint.status === 'in_progress' ? 'amber' : 'green'}>{COMPLAINT_STATUS_LABELS[complaint.status]}</AdminChip>
                <AdminChip tone="neutral">{COMPLAINT_CATEGORY_LABELS[complaint.category]}</AdminChip>
                <span className="text-xs text-slate-400">{formatDateTime(complaint.createdAt)}</span>
                {complaint.handledAt && <span className="text-xs text-slate-400">· опрацьовано {formatDateTime(complaint.handledAt)}</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                <Person label="Автор скарги" name={complaint.complainant.displayName} username={complaint.complainant.username} avatarUrl={complaint.complainant.avatarUrl} />
                {complaint.targetUser
                  ? <Person label="Скаржаться на" name={complaint.targetUser.displayName} username={complaint.targetUser.username} avatarUrl={complaint.targetUser.avatarUrl} />
                  : <p className="text-slate-400">Скарга на повідомлення</p>}
              </div>
              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-6 dark:bg-slate-800/60">{complaint.description}</p>
              {complaint.messagePreview && (
                <div className="mt-2 flex flex-wrap items-start gap-2">
                  <p className="min-w-0 flex-1 border-l-2 border-accent-500 pl-3 text-sm text-slate-500 dark:text-slate-400">«{complaint.messagePreview}»{complaint.messageId ? <span className="ml-1 text-xs text-slate-400">(повідомлення {complaint.messageId})</span> : null}</p>
                  {complaint.messageId && can('message.delete') && (
                    <button type="button" className="secondary-btn px-3 py-1.5 text-xs text-rose-600 dark:text-rose-400" disabled={busyId === complaint.id} onClick={() => void removeMessage(complaint)}>
                      <Trash2 size={14} /> Видалити повідомлення
                    </button>
                  )}
                </div>
              )}
              {complaint.resolution && <p className="mt-2 text-sm text-emerald-600">Рішення: {complaint.resolution}</p>}
              {complaint.status !== 'closed' && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {complaint.status === 'new' && (
                    <button type="button" className="secondary-btn px-3 py-1.5 text-xs" disabled={busyId === complaint.id} onClick={() => void update(complaint, 'in_progress')}>
                      <FolderOpen size={14} /> Взяти в роботу
                    </button>
                  )}
                  <input className="text-input max-w-xs flex-1 py-1.5 text-sm" placeholder="Рішення (для закриття)" value={resolutions[complaint.id] ?? ''} onChange={(event) => setResolutions((current) => ({ ...current, [complaint.id]: event.target.value }))} aria-label="Рішення по скарзі" />
                  <button type="button" className="primary-btn px-3 py-1.5 text-xs" disabled={busyId === complaint.id} onClick={() => void update(complaint, 'closed')}>
                    <CheckCheck size={14} /> Закрити
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!loading && !items.length && <AdminEmpty>Скарг у цьому статусі немає.</AdminEmpty>}
      {!!items.length && <AdminPager total={total} limit={limit} offset={offset} onPage={setOffset} />}
    </div>
  );
}

function Person({ label, name, username, avatarUrl }: { label: string; name: string; username: string; avatarUrl?: string | null }) {
  return (
    <div className="flex items-center gap-2">
      <Avatar name={name} src={avatarUrl} size="sm" />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
        <p className="truncate font-medium">{name} <span className="text-xs font-normal text-slate-400">@{username}</span></p>
      </div>
    </div>
  );
}
