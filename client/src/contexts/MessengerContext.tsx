import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api';
import { publicAsset } from '../api/client';
import type { AppNotification, Channel, CleanupScope, CommunityServer, Conversation, Message, PresenceEvent, SystemNotification } from '../types/models';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';

interface MessengerContextValue {
  conversations: Conversation[];
  servers: CommunityServer[];
  activeConversation: Conversation | null;
  activeServer: CommunityServer | null;
  activeServerId: string | null;
  loading: boolean;
  error: string;
  mobileChatOpen: boolean;
  presence: Record<string, boolean>;
  notifications: AppNotification[];
  systemNotifications: SystemNotification[];
  systemUnread: number;
  refreshInbox: () => Promise<void>;
  markSystemRead: (id: string) => Promise<void>;
  markAllSystemRead: () => Promise<void>;
  selectHome: () => void;
  selectServer: (id: string) => void;
  selectConversation: (id: string) => void;
  selectChannel: (serverId: string, channel: Channel) => void;
  closeMobileChat: () => void;
  reload: () => Promise<void>;
  reloadToken: number;
  clearHistory: (conversationId: string, scope: CleanupScope) => Promise<void>;
  deleteConversation: (conversationId: string, scope: CleanupScope) => Promise<void>;
  createDirect: (userId: string) => Promise<void>;
  createGroup: (title: string, memberIds: string[]) => Promise<void>;
  savedNotes: Conversation | null;
  /** Нотатки існують у єдиному екземплярі на людину, тому «власні» = «або створи». */
  ensureSavedNotes: () => Promise<Conversation>;
  openSavedNotes: () => Promise<void>;
  createServer: (name: string) => Promise<void>;
  createChannel: (name: string) => Promise<void>;
  addServerMember: (userId: string) => Promise<void>;
  markReadLocal: (conversationId: string) => void;
  dismissNotification: (id: string) => void;
  openNotification: (notification: AppNotification) => void;
  notify: (title: string, body?: string) => void;
}

const MessengerContext = createContext<MessengerContextValue | null>(null);

const attachmentLabels: Record<string, string> = { image: 'фото', video: 'відео', document: 'документ', voice: 'голосове повідомлення' };

export function MessengerProvider({ children }: { children: ReactNode }) {
  const { user, endSession } = useAuth();
  const { socket } = useSocket();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [servers, setServers] = useState<CommunityServer[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [systemNotifications, setSystemNotifications] = useState<SystemNotification[]>([]);
  const [systemUnread, setSystemUnread] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeConversationId;
  const conversationsRef = useRef<Conversation[]>([]);
  conversationsRef.current = conversations;

  const activeServer = servers.find((server) => server.id === activeServerId) || null;
  const activeChannel = activeServer?.channels.find((channel) => channel.id === activeConversationId);
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) || (activeChannel && activeServer ? {
    id: activeChannel.id,
    kind: 'channel' as const,
    title: activeChannel.title,
    avatarUrl: activeChannel.avatarUrl,
    serverId: activeServer.id,
    members: activeServer.members.map((member) => ({ ...member, role: member.role as 'owner' | 'admin' | 'member' })),
    unreadCount: activeChannel.unreadCount || 0,
  } : null);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback((title: string, body?: string, conversationId?: string) => {
    const id = crypto.randomUUID();
    setNotifications((current) => [...current.slice(-3), { id, title, body, conversationId, createdAt: Date.now() }]);
    window.setTimeout(() => dismissNotification(id), 5500);
  }, [dismissNotification]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    const [conversationResult, serverResult] = await Promise.allSettled([api.conversations.list(), api.servers.list()]);
    if (conversationResult.status === 'fulfilled') setConversations(conversationResult.value.conversations);
    if (serverResult.status === 'fulfilled') setServers(serverResult.value.servers);
    if (conversationResult.status === 'rejected' && serverResult.status === 'rejected') {
      setError('Не вдалося завантажити розмови. Перевірте з\'єднання та спробуйте ще раз.');
    }
    setLoading(false);
  }, []);

  const refreshInbox = useCallback(async () => {
    if (!user) return;
    try {
      const result = await api.notifications.list(30);
      setSystemNotifications(result.items);
      setSystemUnread(result.unread);
    } catch {
      // Вхідний ящик не блокує роботу месенджера.
    }
  }, [user]);

  useEffect(() => { void refreshInbox(); }, [refreshInbox]);

  const markSystemRead = useCallback(async (id: string) => {
    const target = systemNotifications.find((item) => item.id === id);
    setSystemNotifications((current) => current.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item)));
    setSystemUnread((current) => Math.max(0, current - (target && !target.readAt ? 1 : 0)));
    if (!target || target.readAt) return;
    try {
      await api.notifications.markRead(id);
    } catch {
      void refreshInbox();
    }
  }, [systemNotifications, refreshInbox]);

  const markAllSystemRead = useCallback(async () => {
    const unread = systemNotifications.filter((item) => !item.readAt);
    if (unread.length === 0) return;
    setSystemNotifications((current) => current.map((item) => (item.readAt ? item : { ...item, readAt: new Date().toISOString() })));
    setSystemUnread(0);
    try {
      await Promise.all(unread.map((item) => api.notifications.markRead(item.id)));
    } catch {
      void refreshInbox();
    }
  }, [systemNotifications, refreshInbox]);

  useEffect(() => { void reload(); }, [reload]);

  const refreshQuiet = useCallback(async () => {
    const [conversationResult, serverResult] = await Promise.allSettled([api.conversations.list(), api.servers.list()]);
    if (conversationResult.status === 'fulfilled') setConversations(conversationResult.value.conversations);
    if (serverResult.status === 'fulfilled') setServers(serverResult.value.servers);
  }, []);

  useEffect(() => {
    if (!socket || !user) return;
    const onMessage = (payload: Message | { message: Message }) => {
      const message = 'message' in payload ? payload.message : payload;
      if (!message?.conversationId) return;
      const isActive = activeIdRef.current === message.conversationId && !document.hidden;
      setConversations((current) => {
        const exists = current.some((item) => item.id === message.conversationId);
        const updated = current.map((item) => item.id === message.conversationId ? {
          ...item,
          lastMessage: message,
          updatedAt: message.createdAt,
          unreadCount: message.senderId !== user.id && !isActive ? item.unreadCount + 1 : item.unreadCount,
        } : item);
        return exists ? updated.sort((a, b) => new Date(b.lastMessage?.createdAt || b.updatedAt || 0).getTime() - new Date(a.lastMessage?.createdAt || a.updatedAt || 0).getTime()) : current;
      });
      setServers((current) => current.map((server) => ({ ...server, channels: server.channels.map((channel) => channel.id === message.conversationId ? { ...channel, unreadCount: message.senderId !== user.id && !isActive ? (channel.unreadCount || 0) + 1 : channel.unreadCount } : channel) })));
      if (message.senderId !== user.id && !isActive) {
        const title = message.sender?.displayName || 'Нове повідомлення';
        const body = message.content || (message.kind === 'text' ? 'Нове повідомлення' : `Надіслано: ${attachmentLabels[message.kind] || 'вкладення'}`);
        notify(title, body, message.conversationId);
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(title, { body, icon: publicAsset('favicon.svg') });
        }
      }
    };
    const onNotification = (payload: { type?: string; title?: string; body?: string; message?: Message; conversation?: Conversation; conversationId?: string }) => {
      // Message events already drive the richer toast below, so only side-channel
      // notifications such as a newly created conversation are shown here.
      if (payload.type === 'message') return;
      if (payload.type === 'refresh') {
        void reload();
        return;
      }
      if (payload.type === 'conversation' && payload.conversation) {
        void reload();
        notify('Нова розмова', payload.conversation.title, payload.conversation.id);
        return;
      }
      notify(payload.title || 'Сповіщення Miston', payload.body || payload.conversationId);
    };
    const onPresence = (event: PresenceEvent) => {
      const online = event.online ?? event.isOnline ?? false;
      setPresence((current) => ({ ...current, [event.userId]: online }));
      setConversations((current) => current.map((conversation) => ({ ...conversation, members: conversation.members.map((member) => member.id === event.userId ? { ...member, online, lastSeenAt: event.lastSeenAt } : member) })));
    };
    const onPresenceSnapshot = (payload: { userIds: string[] }) => {
      const online = new Set(payload.userIds);
      setPresence((current) => ({ ...current, ...Object.fromEntries(payload.userIds.map((id) => [id, true])) }));
      setConversations((current) => current.map((conversation) => ({ ...conversation, members: conversation.members.map((member) => ({ ...member, online: online.has(member.id) })) })));
    };
    const onRead = (payload: { conversationId: string; userId?: string }) => {
      if (!payload.userId || payload.userId === user.id) markReadLocal(payload.conversationId);
    };
    const onMessageChanged = (payload: { message?: Message }) => {
      const message = payload.message;
      if (!message?.conversationId) return;
      setConversations((current) => current.map((item) => (
        item.id === message.conversationId && item.lastMessage?.id === message.id
          ? { ...item, lastMessage: message }
          : item
      )));
    };
    const onDeleted = (payload: { conversationId?: string; messageId?: string }) => {
      if (!payload.conversationId || !payload.messageId) return;
      const wasLast = conversationsRef.current.some((item) => item.id === payload.conversationId && item.lastMessage?.id === payload.messageId);
      setConversations((current) => current.map((item) => (
        item.id === payload.conversationId && item.lastMessage?.id === payload.messageId
          ? { ...item, lastMessage: null }
          : item
      )));
      if (wasLast) void refreshQuiet();
    };
    const onSystemNotification = (payload: { notification?: SystemNotification }) => {
      const notification = payload?.notification;
      if (!notification) return;
      setSystemNotifications((current) => [notification, ...current.filter((item) => item.id !== notification.id)]);
      setSystemUnread((current) => current + 1);
      notify(notification.title, notification.body);
    };
    const onBlocked = () => endSession('Ваш акаунт заблоковано адміністрацією. Зверніться до підтримки, щоб дізнатися причину.');
    const onAccountDeleted = () => endSession('Ваш акаунт видалено. Усі дані втрачені назавжди.');
    const onCleared = (payload: { conversationId?: string }) => {
      if (!payload.conversationId) return;
      if (payload.conversationId === activeIdRef.current) setReloadToken((value) => value + 1);
      void refreshQuiet();
    };
    const dropConversation = (conversationId: string) => {
      setConversations((current) => current.filter((item) => item.id !== conversationId));
      setServers((current) => current.map((server) => ({
        ...server,
        channels: server.channels.filter((channel) => channel.id !== conversationId),
      })));
      setActiveConversationId((current) => (current === conversationId ? null : current));
      if (activeIdRef.current === conversationId) setMobileChatOpen(false);
    };
    const onConversationDeleted = (payload: { conversationId?: string }) => {
      if (payload.conversationId) dropConversation(payload.conversationId);
    };
    socket.on('message:new', onMessage);
    socket.on('notification', onNotification);
    socket.on('presence', onPresence);
    socket.on('presence:snapshot', onPresenceSnapshot);
    socket.on('message:read', onRead);
    socket.on('message:updated', onMessageChanged);
    socket.on('message:reactions', onMessageChanged);
    socket.on('message:deleted', onDeleted);
    socket.on('system:notification', onSystemNotification);
    socket.on('account:blocked', onBlocked);
    socket.on('account:deleted', onAccountDeleted);
    socket.on('conversation:cleared', onCleared);
    socket.on('conversation:deleted', onConversationDeleted);
    return () => {
      socket.off('message:new', onMessage);
      socket.off('notification', onNotification);
      socket.off('presence', onPresence);
      socket.off('presence:snapshot', onPresenceSnapshot);
      socket.off('message:read', onRead);
      socket.off('message:updated', onMessageChanged);
      socket.off('message:reactions', onMessageChanged);
      socket.off('message:deleted', onDeleted);
      socket.off('system:notification', onSystemNotification);
      socket.off('account:blocked', onBlocked);
      socket.off('account:deleted', onAccountDeleted);
      socket.off('conversation:cleared', onCleared);
      socket.off('conversation:deleted', onConversationDeleted);
    };
  }, [socket, user, notify, reload, refreshQuiet, endSession]);

  const unreadTotal = conversations.filter((conversation) => conversation.kind !== 'channel').reduce((total, conversation) => total + conversation.unreadCount, 0) + servers.reduce((total, server) => total + server.channels.reduce((sum, channel) => sum + (channel.unreadCount || 0), 0), 0);
  useEffect(() => {
    document.title = unreadTotal ? `(${unreadTotal}) Miston` : 'Miston';
  }, [unreadTotal]);

  function markReadLocal(conversationId: string) {
    setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, unreadCount: 0 } : item));
    setServers((current) => current.map((server) => ({ ...server, channels: server.channels.map((channel) => channel.id === conversationId ? { ...channel, unreadCount: 0 } : channel) })));
  }

  const selectHome = useCallback(() => {
    setActiveServerId(null);
    setActiveConversationId(null);
    setMobileChatOpen(false);
  }, []);
  const selectServer = useCallback((id: string) => {
    setActiveServerId(id);
    setActiveConversationId(null);
    setMobileChatOpen(false);
  }, []);
  const selectConversation = useCallback((id: string) => {
    setActiveServerId(null);
    setActiveConversationId(id);
    setMobileChatOpen(true);
  }, []);
  const selectChannel = useCallback((serverId: string, channel: Channel) => {
    setActiveServerId(serverId);
    setActiveConversationId(channel.id);
    setMobileChatOpen(true);
  }, []);
  const closeMobileChat = useCallback(() => setMobileChatOpen(false), []);

  const createDirect = useCallback(async (userId: string) => {
    const { conversation } = await api.conversations.create({ kind: 'direct', userId });
    setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
    selectConversation(conversation.id);
  }, [selectConversation]);
  const createGroup = useCallback(async (title: string, memberIds: string[]) => {
    const { conversation } = await api.conversations.create({ kind: 'group', title, memberIds });
    setConversations((current) => [conversation, ...current]);
    selectConversation(conversation.id);
  }, [selectConversation]);

  const savedNotes = useMemo(
    () => conversations.find((conversation) => conversation.kind === 'saved') ?? null,
    [conversations],
  );
  const ensureSavedNotes = useCallback(async () => {
    const { conversation } = await api.conversations.create({ kind: 'saved' });
    setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
    return conversation;
  }, []);
  const openSavedNotes = useCallback(async () => {
    const conversation = await ensureSavedNotes();
    selectConversation(conversation.id);
  }, [ensureSavedNotes, selectConversation]);
  const createServer = useCallback(async (name: string) => {
    const { server } = await api.servers.create(name);
    setServers((current) => [...current, server]);
    selectServer(server.id);
  }, [selectServer]);
  const createChannel = useCallback(async (name: string) => {
    if (!activeServerId) return;
    const { channel } = await api.servers.createChannel(activeServerId, name);
    setServers((current) => current.map((server) => server.id === activeServerId ? { ...server, channels: [...server.channels, channel] } : server));
  }, [activeServerId]);
  const addServerMember = useCallback(async (userId: string) => {
    if (!activeServerId) return;
    await api.servers.addMember(activeServerId, userId);
    const { servers: updated } = await api.servers.list();
    setServers(updated);
  }, [activeServerId]);

  const clearHistory = useCallback(async (conversationId: string, scope: CleanupScope) => {
    await api.conversations.clearHistory(conversationId, scope);
    setConversations((current) => current.map((item) => (item.id === conversationId ? { ...item, lastMessage: null, unreadCount: 0 } : item)));
    setServers((current) => current.map((server) => ({
      ...server,
      channels: server.channels.map((channel) => (channel.id === conversationId ? { ...channel, unreadCount: 0 } : channel)),
    })));
    setReloadToken((value) => value + 1);
  }, []);

  const deleteConversation = useCallback(async (conversationId: string, scope: CleanupScope) => {
    await api.conversations.remove(conversationId, scope);
    setConversations((current) => current.filter((item) => item.id !== conversationId));
    setServers((current) => current.map((server) => ({
      ...server,
      channels: server.channels.filter((channel) => channel.id !== conversationId),
    })));
    setActiveConversationId((current) => (current === conversationId ? null : current));
    if (activeIdRef.current === conversationId) setMobileChatOpen(false);
  }, []);

  const openNotification = useCallback((notification: AppNotification) => {
    if (notification.conversationId) selectConversation(notification.conversationId);
    dismissNotification(notification.id);
  }, [selectConversation, dismissNotification]);

  const value = useMemo<MessengerContextValue>(() => ({
    conversations, servers, activeConversation, activeServer, activeServerId, loading, error, mobileChatOpen,
    presence, notifications, systemNotifications, systemUnread, refreshInbox, markSystemRead, markAllSystemRead,
    selectHome, selectServer, selectConversation, selectChannel, closeMobileChat, reload, reloadToken,
    clearHistory, deleteConversation,
    createDirect, createGroup, createServer, createChannel, addServerMember, markReadLocal, dismissNotification,
    savedNotes, ensureSavedNotes, openSavedNotes,
    openNotification, notify: (title, body) => notify(title, body),
  }), [conversations, servers, activeConversation, activeServer, activeServerId, loading, error, mobileChatOpen, presence, notifications, systemNotifications, systemUnread, refreshInbox, markSystemRead, markAllSystemRead, selectHome, selectServer, selectConversation, selectChannel, closeMobileChat, reload, reloadToken, clearHistory, deleteConversation, createDirect, createGroup, createServer, createChannel, addServerMember, dismissNotification, savedNotes, ensureSavedNotes, openSavedNotes, openNotification, notify]);

  return <MessengerContext.Provider value={value}>{children}</MessengerContext.Provider>;
}

export function useMessenger(): MessengerContextValue {
  const context = useContext(MessengerContext);
  if (!context) throw new Error('useMessenger must be used within MessengerProvider');
  return context;
}
