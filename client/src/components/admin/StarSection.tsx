import { Search, TrendingDown, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { ModerationUser, StarHistoryEntry } from '../../types/models';
import { errorMessage, formatDateTime } from '../../utils/format';
import { Avatar } from '../common/Avatar';
import { AdminChip, AdminEmpty, AdminNotice, AdminSectionTitle } from './parts';

export function StarSection({ onBalancesChanged }: { onBalancesChanged: () => void }) {
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<ModerationUser[]>([]);
  const [selected, setSelected] = useState<ModerationUser | null>(null);
  const [history, setHistory] = useState<StarHistoryEntry[]>([]);
  const [balance, setBalance] = useState(0);
  const [amount, setAmount] = useState('10');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setCandidates([]); return; }
    const timer = window.setTimeout(() => {
      void (async () => {
        setSearchError('');
        try {
          const result = await api.admin.users({ q: term, limit: 8 });
          setCandidates(result.users);
        } catch (cause) {
          setSearchError(errorMessage(cause));
        }
      })();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const refreshHistory = useCallback(async (userId: string) => {
    const result = await api.admin.starHistory(userId);
    setHistory(result.items);
    setBalance(result.balance);
  }, []);

  async function pick(user: ModerationUser) {
    setSelected(user);
    setCandidates([]);
    setQuery(`${user.displayName} (@${user.username})`);
    setError('');
    try { await refreshHistory(user.id); } catch (cause) { setError(errorMessage(cause)); }
  }

  async function apply(direction: 'grant' | 'remove') {
    if (!selected) return;
    const value = Number(amount);
    if (!Number.isInteger(value) || value <= 0) { setError('Вкажіть ціле додатне число Star.'); return; }
    setBusy(true);
    setError('');
    try {
      await api.admin.adjustStars(selected.id, direction, value, description.trim());
      setDescription('');
      const updated = await api.admin.users({ q: selected.username, limit: 1 });
      const fresh = updated.users[0];
      if (fresh) setSelected(fresh);
      await refreshHistory(selected.id);
      onBalancesChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <AdminSectionTitle title="Star" hint="Нарахування та списання Star адміністрацією з повною історією операцій" />
      {error && <AdminNotice message={error} />}
      <div className="relative max-w-md">
        <label className="field-label" htmlFor="star-user">Користувач</label>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-3.5 text-slate-400" />
          <input id="star-user" className="text-input pl-9" value={query} placeholder="Почніть вводити імʼя або @username"
            onChange={(event) => { setQuery(event.target.value); setSelected(null); }} />
        </div>
        {searchError && <p className="mt-2 text-xs text-rose-500">{searchError}</p>}
        {candidates.length > 0 && !selected && (
          <ul className="mt-2 max-h-64 overflow-y-auto rounded-xl border bg-white dark:bg-slate-900">
            {candidates.map((user) => (
              <li key={user.id}>
                <button type="button" onClick={() => void pick(user)} className="flex w-full items-center gap-3 border-b px-3 py-2 text-left last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <Avatar name={user.displayName} src={user.avatarUrl} size="sm" online={user.online} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{user.displayName}</span><span className="block truncate text-xs text-slate-400">@{user.username}</span></span>
                  <span className="text-xs tabular-nums text-slate-400">{user.starBalance} Star</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!selected ? <AdminEmpty>Оберіть користувача, щоб нарахувати або списати Star.</AdminEmpty> : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
          <div className="rounded-2xl border p-4">
            <div className="flex items-center gap-3">
              <Avatar name={selected.displayName} src={selected.avatarUrl} size="md" online={selected.online} />
              <div className="min-w-0"><p className="truncate font-semibold">{selected.displayName}</p><p className="truncate text-xs text-slate-400">@{selected.username}</p></div>
            </div>
            <p className="mt-4 text-3xl font-bold tabular-nums">{balance.toLocaleString('uk-UA')}<span className="ml-1 text-sm font-medium text-slate-400">Star на рахунку</span></p>
            <label className="field-label mt-4 block" htmlFor="star-amount">Кількість</label>
            <input id="star-amount" className="text-input" type="number" min={1} value={amount} onChange={(event) => setAmount(event.target.value)} />
            <label className="field-label mt-3 block" htmlFor="star-desc">Опис (необовʼязково)</label>
            <input id="star-desc" className="text-input" value={description} placeholder="Напр. «Подяка за активність»" onChange={(event) => setDescription(event.target.value)} />
            <div className="mt-4 flex gap-2">
              <button type="button" className="primary-btn flex-1" disabled={busy} onClick={() => void apply('grant')}><TrendingUp size={16} />Додати Star</button>
              <button type="button" className="secondary-btn flex-1" disabled={busy} onClick={() => void apply('remove')}><TrendingDown size={16} />Забрати Star</button>
            </div>
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Історія операцій</h4>
            <div className="subtle-scrollbar max-h-[24rem] overflow-y-auto rounded-xl border">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wider text-slate-400 dark:bg-slate-800">
                  <tr><th className="px-3 py-2.5 font-medium">Дата</th><th className="px-3 py-2.5 font-medium">Опис</th><th className="px-3 py-2.5 font-medium">Хто</th><th className="px-3 py-2.5 text-right font-medium">Σ</th><th className="px-3 py-2.5 text-right font-medium">Баланс</th></tr>
                </thead>
                <tbody className="divide-y">
                  {history.map((entry) => (
                    <tr key={entry.id} className="bg-white dark:bg-slate-900">
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(entry.createdAt)}</td>
                      <td className="px-3 py-2.5"><p className="truncate text-sm">{entry.description || entry.reason}</p><p className="text-[11px] text-slate-400">{entry.reason}</p></td>
                      <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">{entry.actorName ?? <AdminChip tone="neutral">система</AdminChip>}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${entry.amount >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{entry.amount > 0 ? '+' : ''}{entry.amount}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">{entry.balanceAfter}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!history.length && <AdminEmpty>Операцій ще немає.</AdminEmpty>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
