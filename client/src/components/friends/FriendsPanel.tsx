import { Check, MessageCircle, Pencil, Search, UserRoundPlus, UserRoundX, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useFriends } from '../../contexts/FriendsContext';
import { useMessenger } from '../../contexts/MessengerContext';
import { useUserSearch } from '../../hooks/useUserSearch';
import type { FriendProfile, FriendshipState } from '../../types/models';
import { errorMessage } from '../../utils/format';
import { Avatar } from '../common/Avatar';
import { Spinner } from '../common/Spinner';
import { StarDisplayName } from '../star/StarDisplayName';

type FriendsView = 'friends' | 'requests' | 'search';

const viewTabs: Array<{ id: FriendsView; label: string }> = [
  { id: 'friends', label: 'Мої друзі' },
  { id: 'requests', label: 'Запити' },
  { id: 'search', label: 'Знайти' },
];

export function FriendsPanel({ onOpenUser, onChatStarted }: { onOpenUser: (id: string) => void; onChatStarted: () => void }) {
  const { user } = useAuth();
  const { createDirect, notify } = useMessenger();
  const {
    friends, incoming, outgoing, incomingCount, loading, error, reload,
    sendRequest, acceptRequest, declineRequest, cancelRequest, removeFriend,
    setAlias, removeAlias,
  } = useFriends();
  const [view, setView] = useState<FriendsView>('friends');
  const [query, setQuery] = useState('');
  const [friendFilter, setFriendFilter] = useState('');
  const [renameTarget, setRenameTarget] = useState<FriendProfile | null>(null);
  const [aliasDraft, setAliasDraft] = useState('');
  const [busyId, setBusyId] = useState('');
  const [actionError, setActionError] = useState('');
  const [overrides, setOverrides] = useState<Record<string, FriendshipState>>({});
  const { users: searchResults, loading: searching, error: searchError } = useUserSearch(query, view === 'search');

  const results = useMemo(
    () => searchResults.filter((candidate) => candidate.id !== user?.id),
    [searchResults, user?.id],
  );
  const filteredFriends = useMemo(() => {
    const needle = friendFilter.trim().toLocaleLowerCase('uk-UA');
    if (!needle) return friends;
    return friends.filter((friend) => [friend.alias, friend.displayName, friend.username]
      .some((value) => value ? value.toLocaleLowerCase('uk-UA').includes(needle) : false));
  }, [friends, friendFilter]);
  const friendIds = useMemo(() => new Set(friends.map((friend) => friend.id)), [friends]);
  const outgoingIds = useMemo(() => new Set(outgoing.map((request) => request.id)), [outgoing]);
  const incomingIds = useMemo(() => new Set(incoming.map((request) => request.id)), [incoming]);

  async function run(userId: string, action: () => Promise<void>, success?: string) {
    setBusyId(userId);
    setActionError('');
    try {
      await action();
      if (success) notify(success);
    } catch (cause) {
      setActionError(errorMessage(cause));
    } finally {
      setBusyId('');
    }
  }

  function addFriend(userId: string) {
    void run(userId, async () => {
      await sendRequest(userId);
      setOverrides((current) => ({ ...current, [userId]: 'outgoing' }));
    }, 'Запит у друзі надіслано');
  }

  function accept(userId: string) {
    void run(userId, async () => {
      await acceptRequest(userId);
      setOverrides((current) => ({ ...current, [userId]: 'friends' }));
    }, 'Тепер ви друзі');
  }

  function decline(userId: string) {
    void run(userId, async () => {
      await declineRequest(userId);
      setOverrides((current) => ({ ...current, [userId]: 'none' }));
    });
  }

  function cancel(userId: string) {
    void run(userId, async () => {
      await cancelRequest(userId);
      setOverrides((current) => ({ ...current, [userId]: 'none' }));
    });
  }

  function remove(userId: string) {
    void run(userId, () => removeFriend(userId), 'Користувача видалено з друзів');
  }

  function openRename(friend: FriendProfile) {
    setActionError('');
    setRenameTarget(friend);
    setAliasDraft(friend.alias ?? '');
  }

  function saveAlias() {
    if (!renameTarget) return;
    const target = renameTarget;
    const value = aliasDraft.trim();
    void run(target.id, async () => {
      if (value) await setAlias(target.id, value);
      else await removeAlias(target.id);
      setRenameTarget(null);
    }, value ? 'Локальне імʼя збережено' : 'Локальне імʼя скинуто');
  }

  async function startChat(userId: string) {
    setBusyId(userId);
    setActionError('');
    try {
      await createDirect(userId);
      onChatStarted();
    } catch (cause) {
      setActionError(errorMessage(cause));
    } finally {
      setBusyId('');
    }
  }

  const visibleError = actionError || error || searchError;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-3 gap-1 px-3 pb-2" role="tablist" aria-label="Розділи друзів">
        {viewTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={view === tab.id}
            onClick={() => setView(tab.id)}
            className={`relative rounded-lg py-1.5 text-xs font-semibold transition ${view === tab.id ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
          >
            {tab.label}
            {tab.id === 'requests' && incomingCount > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-600 px-1 text-[9px] font-bold text-white">{incomingCount}</span>
            )}
          </button>
        ))}
      </div>

      {view === 'search' && (
        <div className="px-3 pb-2">
          <label className="relative block">
            <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              className="text-input border-transparent bg-slate-100 py-2 pl-9 text-sm focus:border-accent-500 dark:bg-slate-800"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setOverrides({}); }}
              placeholder="Ім'я або нік"
              aria-label="Пошук людей для дружби"
            />
          </label>
        </div>
      )}

      <div className="subtle-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {loading && !friends.length ? <Spinner label="Завантаження друзів…" className="py-12" /> : (
          <>
            {visibleError && (
              <div role="alert" className="mx-1 mb-2 flex items-center justify-between gap-2 rounded-xl bg-rose-50 p-2.5 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                <span className="min-w-0">{visibleError}</span>
                <button type="button" className="shrink-0 font-semibold underline" onClick={() => void reload()}>Повторити</button>
              </div>
            )}

            {view === 'friends' && (
              friends.length === 0 ? (
                <FriendsEmpty
                  icon={Users}
                  title="Друзів ще немає"
                  description="Знайдіть людей за іменем або ніком і надішліть запит у друзі."
                  action={<button type="button" className="primary-btn min-h-9 px-3 py-1.5 text-xs" onClick={() => setView('search')}><UserRoundPlus size={15} /> Знайти друзів</button>}
                />
              ) : (
                <>
                  <div className="px-1 pb-2">
                    <label className="relative block">
                      <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                      <input
                        className="text-input border-transparent bg-slate-100 py-2 pl-9 text-sm focus:border-accent-500 dark:bg-slate-800"
                        value={friendFilter}
                        onChange={(event) => setFriendFilter(event.target.value)}
                        placeholder="Пошук серед друзів"
                        aria-label="Пошук серед друзів"
                      />
                    </label>
                  </div>
                  <SectionLabel label="Друзі" count={filteredFriends.length} />
                  {filteredFriends.length === 0 ? (
                    <p className="px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400">Серед друзів нікого не знайдено за «{friendFilter.trim()}».</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {filteredFriends.map((friend) => {
                        const label = friend.alias || friend.displayName;
                        return (
                          <li key={friend.id} className="flex items-center gap-1 rounded-2xl p-1.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/70">
                            <button type="button" onClick={() => onOpenUser(friend.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left">
                              <Avatar name={friend.displayName} src={friend.avatarUrl} online={friend.online} cosmetics={friend.cosmetics} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold"><StarDisplayName name={label} cosmetics={friend.cosmetics} verified={friend.isVerified} /></span>
                                <span className="block truncate text-xs text-slate-500 dark:text-slate-400">@{friend.username}{friend.alias ? ` · ${friend.displayName}` : ''}</span>
                              </span>
                            </button>
                            <button type="button" className="icon-btn h-8 w-8 text-slate-400 hover:text-accent-600 dark:hover:text-accent-400" onClick={() => openRename(friend)} disabled={busyId === friend.id} aria-label={`Перейменувати ${label} для себе`} title="Локальне імʼя"><Pencil size={15} /></button>
                            <button type="button" className="icon-btn h-8 w-8 text-slate-500" onClick={() => void startChat(friend.id)} disabled={busyId === friend.id} aria-label={`Написати ${label}`} title="Написати"><MessageCircle size={16} /></button>
                            <button type="button" className="icon-btn h-8 w-8 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400" onClick={() => remove(friend.id)} disabled={busyId === friend.id} aria-label={`Видалити ${label} з друзів`} title="Видалити з друзів"><UserRoundX size={16} /></button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )
            )}

            {view === 'requests' && (
              <>
                <SectionLabel label="Вхідні запити" count={incoming.length} />
                {incoming.length === 0 ? (
                  <p className="mx-2 mb-4 rounded-xl border border-dashed p-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">Нових вхідних запитів немає.</p>
                ) : (
                  <ul className="space-y-0.5">
                    {incoming.map((request) => (
                      <li key={request.id} className="flex items-center gap-2 rounded-2xl p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/70">
                        <button type="button" onClick={() => onOpenUser(request.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left">
                          <Avatar name={request.displayName} src={request.avatarUrl} online={request.online} cosmetics={request.cosmetics} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold"><StarDisplayName name={request.displayName} cosmetics={request.cosmetics} verified={request.isVerified} /></span>
                            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">@{request.username}</span>
                          </span>
                        </button>
                        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 disabled:opacity-60 dark:bg-emerald-950/40 dark:text-emerald-400" onClick={() => accept(request.id)} disabled={busyId === request.id} aria-label={`Прийняти запит від ${request.displayName}`} title="Прийняти"><Check size={16} /></button>
                        <button type="button" className="icon-btn h-8 w-8 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400" onClick={() => decline(request.id)} disabled={busyId === request.id} aria-label={`Відхилити запит від ${request.displayName}`} title="Відхилити"><X size={16} /></button>
                      </li>
                    ))}
                  </ul>
                )}

                <SectionLabel label="Надіслані запити" count={outgoing.length} className="mt-4" />
                {outgoing.length === 0 ? (
                  <p className="mx-2 rounded-xl border border-dashed p-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">Ви не маєте надісланих запитів.</p>
                ) : (
                  <ul className="space-y-0.5">
                    {outgoing.map((request) => (
                      <li key={request.id} className="flex items-center gap-2 rounded-2xl p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/70">
                        <button type="button" onClick={() => onOpenUser(request.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left">
                          <Avatar name={request.displayName} src={request.avatarUrl} online={request.online} cosmetics={request.cosmetics} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold"><StarDisplayName name={request.displayName} cosmetics={request.cosmetics} verified={request.isVerified} /></span>
                            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">Очікує підтвердження</span>
                          </span>
                        </button>
                        <button type="button" className="icon-btn h-8 w-8 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400" onClick={() => cancel(request.id)} disabled={busyId === request.id} aria-label={`Скасувати запит до ${request.displayName}`} title="Скасувати запит"><X size={16} /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {view === 'search' && (
              query.trim().length < 2 ? (
                <FriendsEmpty icon={Search} title="Знайдіть нових друзів" description="Введіть щонайменше 2 символи імені або ніка." />
              ) : searching ? (
                <Spinner label="Пошук людей…" className="py-12" />
              ) : results.length === 0 ? (
                <p className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">Нікого не знайдено за «{query.trim()}».</p>
              ) : (
                <ul className="space-y-0.5">
                  {results.map((candidate) => {
                    const state = overrides[candidate.id]
                      ?? (friendIds.has(candidate.id) ? 'friends'
                        : outgoingIds.has(candidate.id) ? 'outgoing'
                          : incomingIds.has(candidate.id) ? 'incoming'
                            : candidate.friendship);
                    return (
                      <li key={candidate.id} className="flex items-center gap-2 rounded-2xl p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/70">
                        <button type="button" onClick={() => onOpenUser(candidate.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left">
                          <Avatar name={candidate.displayName} src={candidate.avatarUrl} online={candidate.online} cosmetics={candidate.cosmetics} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold"><StarDisplayName name={candidate.displayName} cosmetics={candidate.cosmetics} verified={candidate.isVerified} /></span>
                            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">@{candidate.username}</span>
                          </span>
                        </button>
                        {state === 'friends' && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">Друзі</span>}
                        {state === 'outgoing' && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">Надіслано</span>}
                        {state === 'incoming' && <button type="button" className="secondary-btn min-h-8 shrink-0 px-2.5 py-1 text-xs" onClick={() => accept(candidate.id)} disabled={busyId === candidate.id}><Check size={14} /> Прийняти</button>}
                        {state === 'none' && <button type="button" className="primary-btn min-h-8 shrink-0 px-2.5 py-1 text-xs" onClick={() => addFriend(candidate.id)} disabled={busyId === candidate.id}><UserRoundPlus size={14} /> Додати</button>}
                      </li>
                    );
                  })}
                </ul>
              )
            )}
          </>
        )}
      </div>

      {renameTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setRenameTarget(null); }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="rename-friend-title" className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-900">
            <h2 id="rename-friend-title" className="text-base font-semibold">Локальне імʼя</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              Це імʼя бачите лише ви. Справжнє імʼя {renameTarget.displayName} (@{renameTarget.username}) не зміниться.
            </p>
            <form onSubmit={(event) => { event.preventDefault(); saveAlias(); }} className="mt-3 space-y-3">
              <input
                autoFocus
                className="text-input w-full text-sm"
                maxLength={80}
                value={aliasDraft}
                onChange={(event) => setAliasDraft(event.target.value)}
                placeholder={renameTarget.displayName}
                aria-label="Нове локальне імʼя"
              />
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="text-xs font-semibold text-slate-500 transition hover:text-rose-600 disabled:opacity-50 dark:text-slate-400 dark:hover:text-rose-400"
                  disabled={!renameTarget.alias || busyId === renameTarget.id}
                  onClick={() => setAliasDraft('')}
                >
                  Скинути
                </button>
                <div className="flex gap-2">
                  <button type="button" className="secondary-btn min-h-9 px-3 py-1.5 text-xs" onClick={() => setRenameTarget(null)}>Скасувати</button>
                  <button type="submit" className="primary-btn min-h-9 px-3 py-1.5 text-xs" disabled={busyId === renameTarget.id}>Зберегти</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ label, count, className = '' }: { label: string; count: number; className?: string }) {
  return (
    <div className={`flex items-center justify-between px-2 pb-2 pt-1 ${className}`}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</h3>
      <span className="text-xs text-slate-400">{count}</span>
    </div>
  );
}

function FriendsEmpty({ icon: Icon, title, description, action }: { icon: typeof Users; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-5 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-50 text-accent-600 dark:bg-accent-500/10 dark:text-accent-400"><Icon size={22} /></div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
