import { Lock, ShieldCheck, ShieldOff, Trash2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { AdminCapability, ModerationUser, UserRole } from '../../types/models';
import { errorMessage } from '../../utils/format';
import { ROLE_LABELS, blockLabel } from '../../utils/moderation';
import { Avatar } from '../common/Avatar';
import { Spinner } from '../common/Spinner';
import { AdminChip, AdminEmpty, AdminNotice, AdminPager, AdminRefreshButton, AdminSectionTitle } from './parts';

const RANK: Record<UserRole, number> = { user: 1, moderator: 2, owner: 3 };

export type UsersView = 'all' | 'verified' | 'blocked';

interface UsersSectionProps {
  view: UsersView;
  me: { id: string; role: UserRole };
  capabilities: AdminCapability[];
  onChanged: () => void;
}

const VIEW_TITLES: Record<UsersView, { title: string; hint: string }> = {
  all: { title: 'Користувачі', hint: 'Пошук, фільтри та повний набір дій над акаунтом' },
  verified: { title: 'Верифікація', hint: 'Синя галочка видається та знімається тут' },
  blocked: { title: 'Блокування', hint: 'Заблоковані акаунти не мають доступу до месенджера' },
};

export function UsersSection({ view, me, capabilities, onChanged }: UsersSectionProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [users, setUsers] = useState<ModerationUser[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(30);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [blocking, setBlocking] = useState<{ id: string; reason: string; hours: string } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.admin.users({
        q: debounced || undefined,
        role: view === 'all' ? roleFilter : 'all',
        status: view === 'verified' ? 'verified' : view === 'blocked' ? 'blocked' : 'all',
        limit,
        offset,
      });
      setUsers(result.users);
      setTotal(result.total);
      setLimit(result.limit);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [debounced, roleFilter, view, limit, offset]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setOffset(0); setBlocking(null); }, [debounced, roleFilter, view]);

  const can = (capability: AdminCapability) => capabilities.includes(capability);
  function manageable(user: ModerationUser) {
    return user.id !== me.id && RANK[user.role] < RANK[me.role];
  }

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setError('');
    try {
      await action();
      await load();
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId('');
    }
  }

  async function confirmDelete(user: ModerationUser) {
    if (!window.confirm(`Видалити акаунт @${user.username}? Дію не можна скасувати.`)) return;
    await run(user.id, () => api.admin.removeUser(user.id));
  }

  async function submitBlock(user: ModerationUser) {
    if (!blocking) return;
    const hours = Number(blocking.hours) || undefined;
    await run(user.id, () => api.admin.block(user.id, blocking.reason.trim(), hours));
    setBlocking(null);
  }

  return (
    <div>
      <AdminSectionTitle
        title={VIEW_TITLES[view].title}
        hint={`${VIEW_TITLES[view].hint} · ${total} записів`}
        actions={(
          <>
            {view === 'all' && can('staff.manage') && (
              <select className="rounded-lg border bg-white px-2.5 py-1.5 text-xs font-medium dark:bg-slate-800" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as UserRole | 'all')} aria-label="Фільтр ролі">
                <option value="all">Будь-яка роль</option>
                <option value="user">Користувачі</option>
                <option value="moderator">Модератори</option>
                <option value="owner">Власники</option>
              </select>
            )}
            <label className="relative"><input className="text-input py-2 sm:w-56" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Пошук за іменем, @username або поштою" aria-label="Пошук користувачів" /></label>
            <AdminRefreshButton onClick={() => void load()} disabled={loading} />
          </>
        )}
      />
      {error && <AdminNotice message={error} onRetry={() => void load()} />}
      {loading ? <Spinner label="Завантаження…" className="py-16" /> : (
        <div className="subtle-scrollbar overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wider text-slate-400 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3 font-medium">Акаунт</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Star</th>
                <th className="px-4 py-3 font-medium">Роль</th>
                {(can('user.verify') || can('user.block') || can('user.delete')) && <th className="px-4 py-3 text-right font-medium">Дії</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((user) => {
                const blocked = Boolean(user.blockedAt);
                const editable = manageable(user);
                const busy = busyId === user.id;
                return (
                  <tr key={user.id} className="bg-white dark:bg-slate-900">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={user.displayName} src={user.avatarUrl} size="sm" online={user.online} />
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 truncate font-medium">
                            {user.displayName}
                            {user.isVerified && <AdminChip tone="blue"><ShieldCheck size={11} /> верифіковано</AdminChip>}
                            {user.id === me.id && <span className="text-[10px] font-normal text-slate-400">це ви</span>}
                          </p>
                          <p className="truncate text-xs text-slate-400">@{user.username}{user.email ? ` · ${user.email}` : ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {blocked
                        ? <span className="flex flex-col gap-1"><AdminChip tone="red">заблоковано</AdminChip><span className="text-[11px] text-slate-400">{blockLabel(user.blockedUntil)}{user.blockedReason ? ` · ${user.blockedReason}` : ''}</span></span>
                        : <AdminChip tone={user.online ? 'green' : 'neutral'}>{user.online ? 'онлайн' : 'офлайн'}</AdminChip>}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{user.starBalance.toLocaleString('uk-UA')}</td>
                    <td className="px-4 py-3">
                      {can('staff.manage') && editable
                        ? (
                          <select className="rounded-lg border bg-white px-2 py-1 text-xs font-medium dark:bg-slate-800" value={user.role} disabled={busy} onChange={(event) => void run(user.id, () => api.admin.setRole(user.id, event.target.value as 'user' | 'moderator'))} aria-label={`Роль для ${user.displayName}`}>
                            <option value="user">Користувач</option>
                            <option value="moderator">Модератор</option>
                          </select>
                        )
                        : <span className="text-xs text-slate-500 dark:text-slate-400">{ROLE_LABELS[user.role]}</span>}
                    </td>
                    {(can('user.verify') || can('user.block') || can('user.delete')) && (
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {can('user.verify') && (
                            <ActionBtn busy={busy} disabled={!editable} tone={user.isVerified ? 'amber' : 'blue'} icon={user.isVerified ? ShieldOff : ShieldCheck} label={user.isVerified ? 'Зняти галочку' : 'Видати галочку'} onClick={() => void run(user.id, () => api.admin.setVerification(user.id, !user.isVerified))} />
                          )}
                          {can('user.block') && (blocked
                            ? <ActionBtn busy={busy} disabled={!editable} tone="green" icon={Undo2} label="Розблокувати" onClick={() => void run(user.id, () => api.admin.unblock(user.id))} />
                            : <ActionBtn busy={busy} disabled={!editable} tone="red" icon={Lock} label="Заблокувати" onClick={() => setBlocking({ id: user.id, reason: '', hours: '24' })} />)}
                          {can('user.delete') && <ActionBtn busy={busy} disabled={!editable} tone="red" icon={Trash2} label="Видалити" onClick={() => void confirmDelete(user)} />}
                        </div>
                        {blocking?.id === user.id && (
                          <div className="mt-2 rounded-xl border bg-slate-50 p-3 text-left dark:bg-slate-800/60">
                            <p className="mb-2 text-xs font-semibold text-slate-500">Блокування @{user.username}</p>
                            <input className="text-input mb-2 py-2 text-sm" placeholder="Причина (обовʼязково бачить користувач)" value={blocking.reason} onChange={(event) => setBlocking({ ...blocking, reason: event.target.value })} />
                            <div className="flex items-center gap-2">
                              <select className="rounded-lg border bg-white px-2 py-1.5 text-xs dark:bg-slate-800" value={blocking.hours} onChange={(event) => setBlocking({ ...blocking, hours: event.target.value })} aria-label="Тривалість блокування">
                                <option value="0">Безстроково</option>
                                <option value="1">1 година</option>
                                <option value="24">24 години</option>
                                <option value="168">Тиждень</option>
                                <option value="720">Місяць</option>
                              </select>
                              <button type="button" className="primary-btn px-3 py-1.5 text-xs" disabled={busy} onClick={() => void submitBlock(user)}>Підтвердити</button>
                              <button type="button" className="secondary-btn px-3 py-1.5 text-xs" onClick={() => setBlocking(null)}>Скасувати</button>
                            </div>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!users.length && <AdminEmpty>Жоден акаунт не відповідає фільтру.</AdminEmpty>}
        </div>
      )}
      <AdminPager total={total} limit={limit} offset={offset} onPage={setOffset} />
    </div>
  );
}

function ActionBtn({ busy, disabled, tone, icon: Icon, label, onClick }: {
  busy: boolean;
  disabled: boolean;
  tone: 'blue' | 'red' | 'green' | 'amber' | 'neutral';
  icon: typeof ShieldCheck;
  label: string;
  onClick: () => void;
}) {
  const tones = {
    blue: 'border-sky-200 text-sky-700 hover:bg-sky-50 dark:border-sky-500/30 dark:text-sky-300 dark:hover:bg-sky-500/10',
    red: 'border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10',
    green: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/10',
    amber: 'border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-500/10',
    neutral: 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
  };
  return (
    <button type="button" disabled={disabled || busy} onClick={onClick} title={label} aria-label={label}
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition disabled:pointer-events-none disabled:opacity-35 ${tones[tone]}`}>
      <Icon size={12} />{label}
    </button>
  );
}
