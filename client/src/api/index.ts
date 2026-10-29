import type { AdminAction, AdminActionLog, AdminOverview, AdminStats, AuthResponse, CleanupScope, CommunityServer, Complaint, ComplaintCategory, ComplaintStatus, Conversation, ConversationKind, FriendsOverview, IceServerConfig, Message, MessageKind, MessagePage, ModerationUser, StarCategory, StarEquipResponse, StarHistoryEntry, StarInventoryResponse, StarOverview, StarPurchaseResponse, StarRarity, StarShopResponse, SentNotification, Sticker, StickerLibrary, StickerPack, SupportRequest, SupportStatus, SupportTopic, SystemNotification, User, UserProfile, UserRole } from '../types/models';
import { request, tokenStore } from './client';

export const api = {
  auth: {
    login: (identifier: string, password: string) => request<AuthResponse>('/auth/login', { method: 'POST', body: { identifier, password }, auth: false }),
    register: (email: string, username: string, displayName: string, password: string) => request<AuthResponse>('/auth/register', { method: 'POST', body: { email, username, displayName, password }, auth: false }),
    me: () => request<{ user: User }>('/auth/me'),
    logout: () => request<void>('/auth/logout', { method: 'POST', body: { refreshToken: tokenStore.refreshToken } }),
  },
  users: {
    search: (query: string) => request<{ users: UserProfile[] }>(`/users/search?q=${encodeURIComponent(query)}`),
    profile: (id: string) => request<{ user: UserProfile; mutualFriends: number }>(`/users/${id}/profile`),
    update: (data: { displayName: string; username: string; bio: string }) => request<{ user: User }>('/users/me', { method: 'PATCH', body: data }),
    avatar: (file: File) => {
      const body = new FormData();
      body.append('avatar', file);
      return request<{ user: User }>('/users/me/avatar', { method: 'POST', body });
    },
  },
  friends: {
    list: () => request<FriendsOverview>('/friends'),
    request: (userId: string) => request<{ status: string }>('/friends/requests', { method: 'POST', body: { userId } }),
    accept: (userId: string) => request<{ status: string }>(`/friends/requests/${userId}/accept`, { method: 'POST' }),
    decline: (userId: string) => request<void>(`/friends/requests/${userId}`, { method: 'DELETE' }),
    cancel: (userId: string) => request<void>(`/friends/requests/${userId}`, { method: 'DELETE' }),
    remove: (userId: string) => request<void>(`/friends/${userId}`, { method: 'DELETE' }),
    setAlias: (userId: string, alias: string) => request<{ alias: string | null }>(`/friends/${userId}/alias`, { method: 'PUT', body: { alias } }),
    removeAlias: (userId: string) => request<void>(`/friends/${userId}/alias`, { method: 'DELETE' }),
  },
  calls: {
    config: () => request<{ iceServers: IceServerConfig[] }>('/calls/config'),
  },
  conversations: {
    list: () => request<{ conversations: Conversation[] }>('/conversations'),
    create: (data: { kind: 'direct'; userId: string } | { kind: 'group'; title: string; memberIds: string[] }) => request<{ conversation: Conversation }>('/conversations', { method: 'POST', body: data }),
    messages: (id: string, before?: string, limit = 40) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (before) params.set('before', before);
      return request<MessagePage>(`/conversations/${id}/messages?${params}`);
    },
    sendText: (id: string, content: string, replyToId?: string | null) => request<{ message: Message }>(`/conversations/${id}/messages`, { method: 'POST', body: { content, ...(replyToId ? { replyToId } : {}) } }),
    sendFile: (id: string, file: File, content: string, kind: MessageKind, durationSeconds?: number, replyToId?: string | null) => {
      const body = new FormData();
      body.append('file', file);
      body.append('content', content);
      body.append('kind', kind);
      if (durationSeconds !== undefined) body.append('durationSeconds', String(durationSeconds));
      if (replyToId) body.append('replyToId', replyToId);
      return request<{ message: Message }>(`/conversations/${id}/messages`, { method: 'POST', body });
    },
    forward: (id: string, messageId: string, targetConversationId: string) => request<{ message: Message }>(`/conversations/${id}/messages/${messageId}/forward`, { method: 'POST', body: { targetConversationId } }),
    sendSticker: (id: string, stickerId: string, replyToId?: string | null) => request<{ message: Message }>(`/conversations/${id}/stickers`, { method: 'POST', body: { stickerId, ...(replyToId ? { replyToId } : {}) } }),
    read: (id: string, messageId: string) => request<void>(`/conversations/${id}/read`, { method: 'POST', body: { messageId } }),
    editMessage: (id: string, messageId: string, content: string) => request<{ message: Message }>(`/conversations/${id}/messages/${messageId}`, { method: 'PATCH', body: { content } }),
    deleteMessage: (id: string, messageId: string) => request<{ messageId: string }>(`/conversations/${id}/messages/${messageId}`, { method: 'DELETE' }),
    toggleReaction: (id: string, messageId: string, emoji: string) => request<{ message: Message }>(`/conversations/${id}/messages/${messageId}/reactions`, { method: 'POST', body: { emoji } }),
    pins: (id: string) => request<{ items: Message[] }>(`/conversations/${id}/pins`),
    pin: (id: string, messageId: string) => request<{ message: Message }>(`/conversations/${id}/pins/${messageId}`, { method: 'POST' }),
    unpin: (id: string, messageId: string) => request<{ message: Message }>(`/conversations/${id}/pins/${messageId}`, { method: 'DELETE' }),
    clearHistory: (id: string, scope: CleanupScope) => request<{ conversationId: string; scope: CleanupScope }>(`/conversations/${id}/clear`, { method: 'POST', body: { scope } }),
    remove: (id: string, scope: CleanupScope) => request<{ conversationId: string; scope: CleanupScope; left: boolean }>(`/conversations/${id}`, { method: 'DELETE', body: { scope } }),
  },
  servers: {
    list: () => request<{ servers: CommunityServer[] }>('/servers'),
    create: (name: string) => request<{ server: CommunityServer }>('/servers', { method: 'POST', body: { name } }),
    createChannel: (id: string, name: string) => request<{ channel: import('../types/models').Channel }>(`/servers/${id}/channels`, { method: 'POST', body: { name } }),
    addMember: (id: string, userId: string) => request<void>(`/servers/${id}/members`, { method: 'POST', body: { userId } }),
  },
  star: {
    overview: () => request<StarOverview>('/star/overview'),
    daily: () => request<import('../types/models').StarUpdate & { claimed: boolean }>('/star/daily', { method: 'POST' }),
    shop: (params: { category?: StarCategory | 'all'; q?: string; rarity?: StarRarity | 'all'; sort?: string } = {}) => {
      const query = new URLSearchParams();
      if (params.category && params.category !== 'all') query.set('category', params.category);
      if (params.rarity && params.rarity !== 'all') query.set('rarity', params.rarity);
      if (params.q) query.set('q', params.q);
      if (params.sort) query.set('sort', params.sort);
      const suffix = query.toString();
      return request<StarShopResponse>(`/star/shop${suffix ? `?${suffix}` : ''}`);
    },
    purchase: (itemId: string) => request<StarPurchaseResponse>(`/star/shop/${encodeURIComponent(itemId)}/purchase`, { method: 'POST' }),
    inventory: (sort = 'recent') => request<StarInventoryResponse>(`/star/inventory?sort=${encodeURIComponent(sort)}`),
    equip: (itemId: string) => request<StarEquipResponse>(`/star/inventory/${encodeURIComponent(itemId)}/equip`, { method: 'POST' }),
    unequip: (itemId: string) => request<StarEquipResponse>(`/star/inventory/${encodeURIComponent(itemId)}/unequip`, { method: 'POST' }),
  },
  stickers: {
    library: () => request<StickerLibrary>('/stickers'),
    setFavorite: (stickerId: string, favorite: boolean) => request<{ stickerId: string; favorite: boolean }>(`/stickers/favorites/${stickerId}`, { method: 'PUT', body: { favorite } }),
    createPack: (name: string, description: string) => request<{ pack: StickerPack }>('/stickers/packs', { method: 'POST', body: { name, description } }),
    updatePack: (packId: string, data: { name?: string; description?: string; isPublic?: boolean }) => request<{ pack: StickerPack }>(`/stickers/packs/${packId}`, { method: 'PATCH', body: data }),
    deletePack: (packId: string) => request<void>(`/stickers/packs/${packId}`, { method: 'DELETE' }),
    addSticker: (packId: string, file: File, label: string) => {
      const body = new FormData();
      body.append('file', file);
      body.append('label', label);
      return request<{ sticker: Sticker }>(`/stickers/packs/${packId}/stickers`, { method: 'POST', body });
    },
    deleteSticker: (stickerId: string) => request<void>(`/stickers/stickers/${stickerId}`, { method: 'DELETE' }),
  },
  admin: {
    overview: () => request<AdminOverview>('/admin/overview'),
    stats: () => request<AdminStats>('/admin/stats'),
    users: (filters: { q?: string; role?: UserRole | 'all'; status?: 'all' | 'online' | 'blocked' | 'verified'; limit?: number; offset?: number } = {}) => {
      const query = new URLSearchParams();
      if (filters.q) query.set('q', filters.q);
      if (filters.role && filters.role !== 'all') query.set('role', filters.role);
      if (filters.status && filters.status !== 'all') query.set('status', filters.status);
      query.set('limit', String(filters.limit ?? 30));
      query.set('offset', String(filters.offset ?? 0));
      return request<{ users: ModerationUser[]; total: number; limit: number; offset: number }>(`/admin/users?${query}`);
    },
    block: (id: string, reason: string, untilHours?: number) => request<{ user: ModerationUser }>(`/admin/users/${id}/block`, { method: 'POST', body: { reason, ...(untilHours ? { untilHours } : {}) } }),
    unblock: (id: string) => request<{ user: ModerationUser }>(`/admin/users/${id}/unblock`, { method: 'POST' }),
    removeUser: (id: string) => request<{ removed: boolean }>(`/admin/users/${id}`, { method: 'DELETE' }),
    setVerification: (id: string, verified: boolean) => request<{ user: ModerationUser }>(`/admin/users/${id}/verification`, { method: 'PUT', body: { verified } }),
    adjustStars: (id: string, direction: 'grant' | 'remove', amount: number, description: string) => request<{ reward: { id: string; amount: number; balanceAfter: number } }>(`/admin/users/${id}/star`, { method: 'POST', body: { direction, amount, description } }),
    starHistory: (id: string) => request<{ balance: number; items: StarHistoryEntry[] }>(`/admin/users/${id}/star-history`),
    setRole: (id: string, role: Exclude<UserRole, 'owner'>) => request<{ user: ModerationUser }>(`/admin/users/${id}/role`, { method: 'PUT', body: { role } }),
    createStaff: (data: { email: string; username: string; displayName: string; password: string }) => request<{ user: ModerationUser }>('/admin/staff', { method: 'POST', body: data }),
    audit: (filters: { action?: AdminAction | 'all'; userId?: string; limit?: number; offset?: number } = {}) => {
      const query = new URLSearchParams();
      if (filters.action && filters.action !== 'all') query.set('action', filters.action);
      if (filters.userId) query.set('userId', filters.userId);
      query.set('limit', String(filters.limit ?? 30));
      query.set('offset', String(filters.offset ?? 0));
      return request<{ items: AdminActionLog[]; total: number; limit: number; offset: number }>(`/admin/audit?${query}`);
    },
    sendNotification: (title: string, body: string) => request<{ notification: SystemNotification }>('/admin/notifications', { method: 'POST', body: { title, body } }),
    sentNotifications: (limit = 20) => request<{ items: SentNotification[] }>(`/admin/notifications?limit=${limit}`),
    complaints: (filters: { status?: ComplaintStatus | 'all'; category?: ComplaintCategory | 'all'; q?: string; limit?: number; offset?: number } = {}) => {
      const query = new URLSearchParams();
      if (filters.status && filters.status !== 'all') query.set('status', filters.status);
      if (filters.category && filters.category !== 'all') query.set('category', filters.category);
      if (filters.q) query.set('q', filters.q);
      query.set('limit', String(filters.limit ?? 30));
      query.set('offset', String(filters.offset ?? 0));
      return request<{ items: Complaint[]; total: number; counts: Record<ComplaintStatus, number>; limit: number; offset: number }>(`/admin/complaints?${query}`);
    },
    setComplaintStatus: (id: string, status: ComplaintStatus, resolution: string) => request<{ complaint: Complaint }>(`/admin/complaints/${id}`, { method: 'PATCH', body: { status, resolution } }),
    support: (filters: { status?: SupportStatus | 'all'; limit?: number; offset?: number } = {}) => {
      const query = new URLSearchParams();
      if (filters.status && filters.status !== 'all') query.set('status', filters.status);
      query.set('limit', String(filters.limit ?? 30));
      query.set('offset', String(filters.offset ?? 0));
      return request<{ items: SupportRequest[]; total: number; counts: Record<SupportStatus, number>; limit: number; offset: number }>(`/admin/support?${query}`);
    },
    setSupportStatus: (id: string, status: SupportStatus, resolution: string) => request<{ request: SupportRequest }>(`/admin/support/${id}`, { method: 'PATCH', body: { status, resolution } }),
    deleteMessage: (messageId: string) => request<{ messageId: string; conversationId: string }>(`/admin/messages/${messageId}`, { method: 'DELETE' }),
  },
  support: {
    create: (data: { topic: SupportTopic; message: string; contactEmail?: string }) => request<{ request: SupportRequest }>('/support', { method: 'POST', body: data }),
    mine: (limit = 20) => request<{ items: SupportRequest[] }>(`/support/mine?limit=${limit}`),
  },
  complaints: {
    submit: (data: { targetUserId?: string; messageId?: string; category: ComplaintCategory; description: string }) => request<{ complaint: Complaint }>('/complaints', { method: 'POST', body: data }),
    mine: (limit = 20) => request<{ items: Complaint[] }>(`/complaints/mine?limit=${limit}`),
  },
  notifications: {
    list: (limit = 30) => request<{ items: SystemNotification[]; unread: number }>(`/notifications?limit=${limit}`),
    markRead: (id: string) => request<{ notification: SystemNotification }>(`/notifications/${id}/read`, { method: 'POST' }),
  },
};

export type { ConversationKind };
