import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api';
import type { FriendsOverview, FriendshipEvent, FriendshipEventType } from '../types/models';
import { errorMessage } from '../utils/format';
import { useAuth } from './AuthContext';
import { useMessenger } from './MessengerContext';
import { useSocket } from './SocketContext';

interface FriendsContextValue extends FriendsOverview {
  incomingCount: number;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  sendRequest: (userId: string) => Promise<void>;
  acceptRequest: (userId: string) => Promise<void>;
  declineRequest: (userId: string) => Promise<void>;
  cancelRequest: (userId: string) => Promise<void>;
  removeFriend: (userId: string) => Promise<void>;
  setAlias: (userId: string, alias: string) => Promise<void>;
  removeAlias: (userId: string) => Promise<void>;
}

const FriendsContext = createContext<FriendsContextValue | null>(null);

const emptyOverview: FriendsOverview = { friends: [], incoming: [], outgoing: [] };

const eventCopy: Record<FriendshipEventType, (name: string) => { title: string; body: string }> = {
  request: (name) => ({ title: name, body: 'Хоче додати вас у друзі.' }),
  accepted: (name) => ({ title: name, body: 'Запит у друзі прийнято.' }),
  declined: (name) => ({ title: name, body: 'Запит у друзі відхилено.' }),
  cancelled: (name) => ({ title: name, body: 'Запит у друзі скасовано.' }),
  removed: (name) => ({ title: name, body: 'Вас видалено зі списку друзів.' }),
};

export function FriendsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { notify, reload: reloadMessenger } = useMessenger();
  const userId = user?.id;
  const [data, setData] = useState<FriendsOverview>(emptyOverview);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSeq = useRef(0);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const reload = useCallback(async () => {
    if (!userId) return;
    const seq = ++requestSeq.current;
    try {
      const result = await api.friends.list();
      if (seq !== requestSeq.current) return;
      setData(result);
      setError('');
    } catch (cause) {
      if (seq === requestSeq.current) setError(errorMessage(cause));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    void reload();
  }, [userId, reload]);

  useEffect(() => {
    if (!socket || !userId) return;
    const onChange = (event: FriendshipEvent) => {
      void reload();
      if (!event?.actor || event.actor.id === userId) return;
      const copy = eventCopy[event.type];
      if (copy) {
        const message = copy(event.actor.displayName);
        notifyRef.current(message.title, message.body);
      }
    };
    socket.on('friends:changed', onChange);
    return () => { socket.off('friends:changed', onChange); };
  }, [socket, userId, reload]);

  const sendRequest = useCallback(async (targetId: string) => {
    await api.friends.request(targetId);
    await reload();
  }, [reload]);
  const acceptRequest = useCallback(async (targetId: string) => {
    await api.friends.accept(targetId);
    await reload();
  }, [reload]);
  const declineRequest = useCallback(async (targetId: string) => {
    await api.friends.decline(targetId);
    await reload();
  }, [reload]);
  const cancelRequest = useCallback(async (targetId: string) => {
    await api.friends.cancel(targetId);
    await reload();
  }, [reload]);
  const removeFriend = useCallback(async (targetId: string) => {
    await api.friends.remove(targetId);
    await reload();
  }, [reload]);
  const setAlias = useCallback(async (targetId: string, alias: string) => {
    const result = await api.friends.setAlias(targetId, alias);
    setData((current) => ({
      ...current,
      friends: current.friends.map((friend) => friend.id === targetId ? { ...friend, alias: result.alias } : friend),
    }));
    await Promise.all([reload(), reloadMessenger()]);
  }, [reload, reloadMessenger]);
  const removeAlias = useCallback(async (targetId: string) => {
    await api.friends.removeAlias(targetId);
    setData((current) => ({
      ...current,
      friends: current.friends.map((friend) => friend.id === targetId ? { ...friend, alias: null } : friend),
    }));
    await Promise.all([reload(), reloadMessenger()]);
  }, [reload, reloadMessenger]);

  const value = useMemo<FriendsContextValue>(() => ({
    ...data,
    incomingCount: data.incoming.length,
    loading,
    error,
    reload,
    sendRequest,
    acceptRequest,
    declineRequest,
    cancelRequest,
    removeFriend,
    setAlias,
    removeAlias,
  }), [data, loading, error, reload, sendRequest, acceptRequest, declineRequest, cancelRequest, removeFriend, setAlias, removeAlias]);

  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
}

export function useFriends(): FriendsContextValue {
  const context = useContext(FriendsContext);
  if (!context) throw new Error('useFriends must be used within FriendsProvider');
  return context;
}
