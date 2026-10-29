import { Check, Flag, MessageCircle, ShieldCheck, UserRoundPlus, UserRoundX, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useFriends } from '../../contexts/FriendsContext';
import { useMessenger } from '../../contexts/MessengerContext';
import type { FriendshipState, UserProfile } from '../../types/models';
import { errorMessage } from '../../utils/format';
import { isStaffRole } from '../../utils/moderation';
import { configStringArray } from '../../utils/star';
import { Avatar } from '../common/Avatar';
import { Modal } from '../common/Modal';
import { Spinner } from '../common/Spinner';
import { StarDisplayName } from '../star/StarDisplayName';

function formatDate(value?: string | null): string {
  if (!value) return 'невідомо';
  return new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
}

function formatLastSeen(value?: string | null): string {
  if (!value) return 'невідомо';
  return new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function UserProfileModal({ userId, onClose, onReport }: { userId: string | null; onClose: () => void; onReport: (target: { userId?: string }) => void }) {
  const { createDirect } = useMessenger();
  const { sendRequest, acceptRequest, declineRequest, cancelRequest, removeFriend } = useFriends();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [mutualFriends, setMutualFriends] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    setError('');
    setActionError('');
    setProfile(null);
    setMutualFriends(0);
    void api.users.profile(userId).then((result) => {
      if (!active) return;
      setProfile(result.user);
      setMutualFriends(result.mutualFriends);
    }).catch((cause) => {
      if (active) setError(errorMessage(cause));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [userId, reloadKey]);

  async function act(action: () => Promise<void>, next: FriendshipState) {
    if (!profile) return;
    setBusy(true);
    setActionError('');
    try {
      await action();
      setProfile((current) => current ? { ...current, friendship: next } : current);
    } catch (cause) {
      setActionError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function message() {
    if (!profile) return;
    setBusy(true);
    setActionError('');
    try {
      await createDirect(profile.id);
      onClose();
    } catch (cause) {
      setActionError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const friendship = profile?.friendship ?? 'none';
  const title = profile?.displayName || 'Профіль користувача';
  const backgroundGradient = profile?.cosmetics?.profile_background
    ? configStringArray(profile.cosmetics.profile_background.config, 'gradient')
    : [];

  return (
    <Modal open={Boolean(userId)} onClose={onClose} title={title} description={profile ? `@${profile.username}` : undefined}>
      {loading ? <Spinner label="Завантаження профілю…" className="py-16" /> : error ? (
        <div className="py-10 text-center">
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          <button type="button" className="secondary-btn mt-4" onClick={() => setReloadKey((value) => value + 1)}>Спробувати ще раз</button>
        </div>
      ) : profile ? (
        <div>
          <div className="relative -mx-5 -mt-5 mb-5 overflow-hidden border-b px-5 pb-6 pt-8 text-center sm:-mx-6 sm:-mt-6 sm:px-6" style={backgroundGradient.length >= 2 ? { backgroundImage: `linear-gradient(135deg, ${backgroundGradient.join(', ')})` } : undefined}>
            <div className="relative flex flex-col items-center">
              <Avatar name={profile.displayName} src={profile.avatarUrl} size="xl" online={profile.online} cosmetics={profile.cosmetics} />
              <h3 className="mt-3 flex max-w-full items-center gap-2 text-lg font-bold">
                <StarDisplayName name={profile.displayName} cosmetics={profile.cosmetics} verified={profile.isVerified} />
                {isStaffRole(profile.role) && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-semibold text-accent-700 dark:bg-accent-500/10 dark:text-accent-300"><ShieldCheck size={12} /> {profile.role === 'owner' ? 'Власник' : 'Модератор'}</span>}
              </h3>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">@{profile.username}</p>
              <p className={`mt-2 text-xs font-medium ${profile.online ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                {profile.online ? 'Онлайн' : `Остання активність: ${formatLastSeen(profile.lastSeenAt)}`}
              </p>
            </div>
          </div>

          <div className="space-y-4 py-5">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Про себе</h4>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600 dark:text-slate-300">{profile.bio || 'Користувач ще не додав опис.'}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-400">Спільні друзі</p>
                <p className="mt-0.5 font-semibold tabular-nums">{mutualFriends}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-400">У Miston з</p>
                <p className="mt-0.5 font-semibold">{formatDate(profile.createdAt)}</p>
              </div>
            </div>
          </div>

          {actionError && <p role="alert" className="mb-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{actionError}</p>}

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            {friendship === 'none' && (
              <>
                <button type="button" className="primary-btn" onClick={() => void act(() => sendRequest(profile.id), 'outgoing')} disabled={busy}><UserRoundPlus size={16} /> Додати в друзі</button>
                <button type="button" className="secondary-btn" onClick={() => void message()} disabled={busy}><MessageCircle size={16} /> Написати</button>
              </>
            )}
            {friendship === 'outgoing' && (
              <>
                <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">Запит надіслано</span>
                <button type="button" className="secondary-btn" onClick={() => void act(() => cancelRequest(profile.id), 'none')} disabled={busy}>Скасувати запит</button>
              </>
            )}
            {friendship === 'incoming' && (
              <>
                <button type="button" className="primary-btn" onClick={() => void act(() => acceptRequest(profile.id), 'friends')} disabled={busy}><Check size={16} /> Прийняти запит</button>
                <button type="button" className="secondary-btn" onClick={() => void act(() => declineRequest(profile.id), 'none')} disabled={busy}><X size={16} /> Відхилити</button>
              </>
            )}
            {friendship === 'friends' && (
              <>
                <button type="button" className="primary-btn" onClick={() => void message()} disabled={busy}><MessageCircle size={16} /> Написати</button>
                <button type="button" className="secondary-btn text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30" onClick={() => void act(() => removeFriend(profile.id), 'none')} disabled={busy}><UserRoundX size={16} /> Видалити з друзів</button>
              </>
            )}
            {friendship === 'self' && <p className="text-sm text-slate-500 dark:text-slate-400">Це ваш профіль. Змінити дані можна через меню профілю.</p>}
            {friendship !== 'self' && (
              <button type="button" className="secondary-btn ml-auto" onClick={() => { onReport({ userId: profile.id }); onClose(); }}><Flag size={16} /> Скаржитися</button>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
