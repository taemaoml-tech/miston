import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api';
import type { StarAchievement, StarCosmetic, StarCosmetics, StarOverview, StarPurchaseResponse, StarReward, StarUpdate } from '../types/models';
import { applyAccentPalette, resetAccentPalette } from '../utils/star';
import { errorMessage } from '../utils/format';
import { StarRewardLayer } from '../components/star/StarRewardLayer';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';

interface Celebration {
  key: number;
  rewards: StarReward[];
  achievements: StarAchievement[];
}

interface StarContextValue {
  overview: StarOverview | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  claimDaily: () => Promise<boolean>;
  purchase: (itemId: string) => Promise<StarPurchaseResponse>;
  equip: (itemId: string) => Promise<void>;
  unequip: (itemId: string) => Promise<void>;
  messageEffect: StarCosmetic | null;
}

const StarContext = createContext<StarContextValue | null>(null);

function syncOverview(current: StarOverview, update: StarUpdate): StarOverview {
  const achievements = current.achievements.map((achievement) => {
    const unlockedNow = update.achievements.find((item) => item.id === achievement.id);
    const metric = achievement.metric === 'messages'
      ? update.wallet.messageCount
      : achievement.metric === 'active_days'
        ? update.wallet.activeDays
        : update.wallet.level;
    return {
      ...achievement,
      current: metric,
      progress: achievement.unlocked || unlockedNow ? 100 : Math.min(100, Math.round((metric / achievement.threshold) * 100)),
      unlocked: achievement.unlocked || Boolean(unlockedNow),
      unlockedAt: unlockedNow?.unlockedAt ?? achievement.unlockedAt,
    };
  });
  return {
    ...current,
    wallet: update.wallet,
    achievements,
    recentTransactions: [...update.rewards, ...current.recentTransactions].slice(0, 12),
    stats: {
      ...current.stats,
      unlockedAchievements: achievements.filter((achievement) => achievement.unlocked).length,
    },
  };
}

export function StarProvider({ children }: { children: ReactNode }) {
  const { user, updateUser } = useAuth();
  const { socket } = useSocket();
  const [overview, setOverview] = useState<StarOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const celebrationTimer = useRef<number | undefined>(undefined);
  const audioRef = useRef<AudioContext | null>(null);
  const userRef = useRef(user);
  userRef.current = user;

  const celebrate = useCallback((update: Pick<StarUpdate, 'rewards' | 'achievements'>) => {
    if (!update.rewards.length && !update.achievements.length) return;
    setCelebration((current) => ({
      key: Date.now(),
      rewards: [...(current?.rewards ?? []), ...update.rewards].slice(-6),
      achievements: [...(current?.achievements ?? []), ...update.achievements]
        .filter((item, index, list) => list.findIndex((entry) => entry.id === item.id) === index),
    }));
    if (celebrationTimer.current) window.clearTimeout(celebrationTimer.current);
    celebrationTimer.current = window.setTimeout(() => setCelebration(null), 5200);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await api.star.overview();
      setOverview(next);
      setError('');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setOverview(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void api.star.overview().then((next) => {
      if (!active) return;
      setOverview(next);
      setError('');
    }).catch((cause) => {
      if (active) setError(errorMessage(cause));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!socket) return;
    const onUpdate = (update: StarUpdate) => {
      setOverview((current) => current ? syncOverview(current, update) : current);
      celebrate(update);
    };
    socket.on('star:update', onUpdate);
    return () => { socket.off('star:update', onUpdate); };
  }, [socket, celebrate]);

  useEffect(() => {
    const themeConfig = overview?.equipped?.theme?.config;
    applyAccentPalette(themeConfig?.palette);
    return () => resetAccentPalette();
  }, [overview?.equipped?.theme?.itemId, overview?.equipped?.theme?.config]);

  const soundNotes = useMemo(() => {
    const notes = overview?.equipped?.sound?.config?.notes;
    return Array.isArray(notes) ? notes.map(Number).filter((note) => Number.isFinite(note) && note > 0) : null;
  }, [overview?.equipped?.sound?.itemId, overview?.equipped?.sound?.config]);

  const ensureAudio = useCallback(() => {
    try {
      const Constructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Constructor) return null;
      if (!audioRef.current) audioRef.current = new Constructor();
      if (audioRef.current.state === 'suspended') void audioRef.current.resume();
      return audioRef.current;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const unlock = () => { ensureAudio(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, [ensureAudio]);

  useEffect(() => {
    if (!socket || !soundNotes?.length) return;
    const onNotification = (payload: { type?: string; message?: { senderId?: string } }) => {
      if (payload?.type !== 'message' || !payload.message || payload.message.senderId === userRef.current?.id) return;
      if (!document.hidden) return;
      const context = ensureAudio();
      if (!context) return;
      const start = context.currentTime + 0.02;
      soundNotes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        const offset = start + index * 0.13;
        gain.gain.setValueAtTime(0.0001, offset);
        gain.gain.exponentialRampToValueAtTime(0.08, offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, offset + 0.22);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(offset);
        oscillator.stop(offset + 0.24);
      });
    };
    socket.on('notification', onNotification);
    return () => { socket.off('notification', onNotification); };
  }, [socket, soundNotes, ensureAudio]);

  useEffect(() => () => {
    if (celebrationTimer.current) window.clearTimeout(celebrationTimer.current);
    if (audioRef.current) void audioRef.current.close().catch(() => undefined);
  }, []);

  const syncUserCosmetics = useCallback((cosmetics: StarCosmetics) => {
    const current = userRef.current;
    if (current) updateUser({ ...current, cosmetics });
  }, [updateUser]);

  const claimDaily = useCallback(async () => {
    const result = await api.star.daily();
    setOverview((current) => current ? syncOverview(current, result) : current);
    if (result.claimed) celebrate(result);
    return result.claimed;
  }, [celebrate]);

  const purchase = useCallback(async (itemId: string) => {
    const result = await api.star.purchase(itemId);
    setOverview((current) => {
      if (!current) return current;
      const merged = syncOverview(current, result);
      return {
        ...merged,
        equipped: result.equipped,
        stats: { ...merged.stats, owned: current.stats.owned + 1 },
      };
    });
    syncUserCosmetics(result.equipped);
    celebrate(result);
    return result;
  }, [celebrate, syncUserCosmetics]);

  const equip = useCallback(async (itemId: string) => {
    const result = await api.star.equip(itemId);
    setOverview((current) => current ? { ...current, equipped: result.equipped } : current);
    syncUserCosmetics(result.equipped);
  }, [syncUserCosmetics]);

  const unequip = useCallback(async (itemId: string) => {
    const result = await api.star.unequip(itemId);
    setOverview((current) => current ? { ...current, equipped: result.equipped } : current);
    syncUserCosmetics(result.equipped);
  }, [syncUserCosmetics]);

  const value = useMemo<StarContextValue>(() => ({
    overview,
    loading,
    error,
    refresh,
    claimDaily,
    purchase,
    equip,
    unequip,
    messageEffect: overview?.equipped?.message_effect ?? null,
  }), [overview, loading, error, refresh, claimDaily, purchase, equip, unequip]);

  return (
    <StarContext.Provider value={value}>
      {children}
      <StarRewardLayer celebration={celebration} onClose={() => setCelebration(null)} />
    </StarContext.Provider>
  );
}

export function useStar(): StarContextValue {
  const context = useContext(StarContext);
  if (!context) throw new Error('useStar must be used within StarProvider');
  return context;
}
