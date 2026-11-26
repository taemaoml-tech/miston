import type { AdminAction, AdminActionLog, AdminOverview, AdminStats, AuthResponse, BotAccount, CallInfo, ChatFolder, CleanupScope, CommunityServer, Complaint, ComplaintCategory, ComplaintStatus, Conversation, ConversationKind, E2eeBackup, E2eeStatus, FriendsOverview, IceServerConfig, LoginChallenge, LoginResult, LoginSession, Message, MessageKind, MessagePage, ModerationUser, StarCategory, StarEquipResponse, StarHistoryEntry, StarInventoryResponse, StarOverview, StarPurchaseResponse, StarRarity, StarShopResponse, SentNotification, Sticker, StickerLibrary, StickerPack, SupportRequest, SupportStatus, SupportTopic, SystemNotification, TwoFactorChallenge, User, UserProfile, UserRole } from '../types/models';
import { request, tokenStore } from './client';

export const api = {
  auth: {
    login: (identifier: string, password: string) => request<LoginResult>('/auth/login', { method: 'POST', body: { identifier, password }, auth: false }),
    register: (email: string, username: string, displayName: string, password: string, phone?: string) => request<AuthResponse>('/auth/register', { method: 'POST', body: { email, username, displayName, password, ...(phone ? { phone } : {}) }, auth: false }),
    loginVerify: (challengeId: string, code: string) => request<AuthResponse | TwoFactorChallenge>('/auth/login/verify', { method: 'POST', body: { challengeId, code }, auth: false }),
    login2fa: (token: string, password: string) => request<AuthResponse>('/auth/login/2fa', { method: 'POST', body: { token, password }, auth: false }),
    loginResend: (challengeId: string) => request<LoginChallenge>('/auth/login/resend', { method: 'POST', body: { challengeId }, auth: false }),
    loginEmail: (challengeId: string) => request<LoginChallenge>('/auth/login/email', { method: 'POST', body: { challengeId }, auth: false }),
    twoFactor: {
      status: () => request<{ enabled: boolean; hint: string | null }>('/auth/2fa'),
      setup: (currentPassword: string, password: string, hint?: string) => request<{ enabled: boolean }>('/auth/2fa/setup', { method: 'POST', body: { currentPassword, password, hint } }),
      disable: (password: string) => request<{ enabled: boolean }>('/auth/2fa/disable', { method: 'POST', body: { password } }),
    },
    sessions: () => request<{ sessions: LoginSession[] }>('/auth/sessions'),
    revokeSession: (id: string) => request<void>(`/auth/sessions/${id}`, { method: 'DELETE' }),
    me: () => request<{ user: User }>('/auth/me'),
    logout: () => request<void>('/auth/logout', { method: 'POST', body: { refreshToken: tokenStore.refreshToken } }),
    phone: {
      status: () => request<{ phoneNumber: string | null; phoneVerified: boolean; smsNotificationsEnabled: boolean; pendingPhone: string | null; pendingExpiresAt: string | null; smsConfigured: boolean }>('/auth/phone'),
      request: (phone: string) => request<{ sent: boolean; phoneNumber: string; expiresAt: string; debugCode?: string }>('/auth/phone/request', { method: 'POST', body: { phone } }),
      verify: (code: string) => request<{ user: User; verified: boolean }>('/auth/phone/verify', { method: 'POST', body: { code } }),
      setNotifications: (enabled: boolean) => request<{ user: User; smsNotificationsEnabled: boolean }>('/auth/phone/notifications', { method: 'PATCH', body: { enabled } }),
    },
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
    get: (id: string) => request<{ call: CallInfo }>(`/calls/${id}`),
  },
  bots: {
    father: () => request<{ user: { id: string; username: string; displayName: string } }>('/bots/father'),
    mine: () => request<{ bots: BotAccount[] }>('/bots/mine'),
    connect: (token: string) => request<{ bot: BotAccount }>('/bots/connect', { method: 'POST', body: { token } }),
    update: (username: string, data: { funMode?: boolean; description?: string; displayName?: string }) => request<{ bot: BotAccount }>(`/bots/${encodeURIComponent(username)}`, { method: 'PATCH', body: data }),
    remove: (username: string) => request<{ ok: true }>(`/bots/${encodeURIComponent(username)}`, { method: 'DELETE' }),
  },
  folders: {
    list: () => request<{ folders: ChatFolder[] }>('/chat-folders'),
    create: (name: string, color?: string) => request<{ folder: ChatFolder }>('/chat-folders', { method: 'POST', body: { name, color } }),
    rename: (id: string, data: { name?: string; color?: string }) => request<{ folder: ChatFolder }>(`/chat-folders/${id}`, { method: 'PATCH', body: data }),
    remove: (id: string) => request<{ ok: true }>(`/chat-folders/${id}`, { method: 'DELETE' }),
    addConversation: (id: string, conversationId: string) => request<{ ok: true }>(`/chat-folders/${id}/conversations`, { method: 'POST', body: { conversationId } }),
    removeConversation: (id: string, conversationId: string) => request<{ ok: true }>(`/chat-folders/${id}/conversations/${conversationId}`, { method: 'DELETE' }),
    setConversations: (id: string, conversationIds: string[]) => request<{ ok: true }>(`/chat-folders/${id}/conversations`, { method: 'PUT', body: { conversationIds } }),
  },
  push: {
    register: (token: string, platform: string) => request<void>('/push/register', { method: 'POST', body: { token, platform } }),
    unregister: (token: string) => request<void>('/push/unregister', { method: 'POST', body: { token } }),
    status: () => request<{ tokens: number; configured: boolean; error?: string }>('/push/status'),
    test: () => request<{ tokens: number; sent: number; failed: number; errors: string[]; configured: boolean }>('/push/test', { method: 'POST', body: {} }),
  },
  conversations: {
    list: () => request<{ conversations: Conversation[] }>('/conversations'),
    create: (data: { kind: 'direct'; userId: string } | { kind: 'saved' } | { kind: 'group'; title: string; memberIds: string[] }) => request<{ conversation: Conversation }>('/conversations', { method: 'POST', body: data }),
    messages: (id: string, before?: string, limit = 40) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (before) params.set('before', before);
      return request<MessagePage>(`/conversations/${id}/messages?${params}`);
    },
    sendText: (id: string, content: string, replyToId?: string | null, encryption?: { encrypted: boolean; encryptionVersion?: number | null }) => request<{ message: Message }>(`/conversations/${id}/messages`, { method: 'POST', body: { content, ...(replyToId ? { replyToId } : {}), ...(encryption?.encrypted ? { encrypted: true, encryptionVersion: encryption.encryptionVersion ?? 1 } : {}) } }),
    sendFile: (id: string, file: File, content: string, kind: MessageKind, durationSeconds?: number, replyToId?: string | null, encryption?: { encrypted: boolean; encryptionVersion?: number | null }) => {
      const body = new FormData();
      body.append('file', file);
      body.append('content', content);
      body.append('kind', kind);
      if (durationSeconds !== undefined) body.append('durationSeconds', String(durationSeconds));
      if (replyToId) body.append('replyToId', replyToId);
      if (encryption?.encrypted) {
        body.append('encrypted', 'true');
        body.append('encryptionVersion', String(encryption.encryptionVersion ?? 1));
      }
      return request<{ message: Message }>(`/conversations/${id}/messages`, { method: 'POST', body });
    },
    forward: (id: string, messageId: string, targetConversationId: string, encryption?: { content: string; encrypted: boolean; encryptionVersion?: number | null }) => request<{ message: Message }>(`/conversations/${id}/messages/${messageId}/forward`, {
      method: 'POST',
      body: encryption?.encrypted
        ? { targetConversationId, content: encryption.content, encrypted: true, encryptionVersion: encryption.encryptionVersion ?? 1 }
        : { targetConversationId },
    }),
    sendSticker: (id: string, stickerId: string, replyToId?: string | null) => request<{ message: Message }>(`/conversations/${id}/stickers`, { method: 'POST', body: { stickerId, ...(replyToId ? { replyToId } : {}) } }),
    read: (id: string, messageId: string) => request<void>(`/conversations/${id}/read`, { method: 'POST', body: { messageId } }),
    editMessage: (id: string, messageId: string, content: string, encryption?: { encrypted: boolean; encryptionVersion?: number | null }) => request<{ message: Message }>(`/conversations/${id}/messages/${messageId}`, {
      method: 'PATCH',
      body: { content, ...(encryption?.encrypted ? { encrypted: true, encryptionVersion: encryption.encryptionVersion ?? 1 } : {}) },
    }),
    deleteMessage: (id: string, messageId: string) => request<{ messageId: string }>(`/conversations/${id}/messages/${messageId}`, { method: 'DELETE' }),
    toggleReaction: (id: string, messageId: string, emoji: string) => request<{ message: Message }>(`/conversations/${id}/messages/${messageId}/reactions`, { method: 'POST', body: { emoji } }),
    pins: (id: string) => request<{ items: Message[] }>(`/conversations/${id}/pins`),
    pin: (id: string, messageId: string) => request<{ message: Message }>(`/conversations/${id}/pins/${messageId}`, { method: 'POST' }),
    unpin: (id: string, messageId: string) => request<{ message: Message }>(`/conversations/${id}/pins/${messageId}`, { method: 'DELETE' }),
    clearHistory: (id: string, scope: CleanupScope) => request<{ conversationId: string; scope: CleanupScope }>(`/conversations/${id}/clear`, { method: 'POST', body: { scope } }),
    remove: (id: string, scope: CleanupScope) => request<{ conversationId: string; scope: CleanupScope; left: boolean }>(`/conversations/${id}`, { method: 'DELETE', body: { scope } }),
  },
  e2ee: {
    status: () => request<E2eeStatus>('/e2ee/me'),
    publicKeys: (ids: string[]) => request<{ keys: Record<string, string> }>(`/e2ee/public-keys?ids=${encodeURIComponent(ids.join(','))}`),
    publishPublicKey: (publicKey: string) => request<{ ok: true }>('/e2ee/public-key', { method: 'PUT', body: { publicKey } }),
    disable: () => request<{ ok: true }>('/e2ee/public-key', { method: 'DELETE' }),
    conversationKey: (conversationId: string) => request<{ wrappedKey: string | null; keyVersion: number | null }>(`/e2ee/conversations/${conversationId}/key`),
    conversationKeyMembers: (conversationId: string) => request<{ userIds: string[] }>(`/e2ee/conversations/${conversationId}/key/members`),
    saveConversationKeys: (conversationId: string, keys: Array<{ userId: string; wrappedKey: string }>) => request<{ ok: true }>(`/e2ee/conversations/${conversationId}/keys`, { method: 'POST', body: { keys } }),
    backup: () => request<{ backup: E2eeBackup | null }>('/e2ee/backup'),
    saveBackup: (backup: Omit<E2eeBackup, 'updatedAt'>) => request<{ ok: true }>('/e2ee/backup', { method: 'PUT', body: backup }),
    deleteBackup: () => request<{ ok: true }>('/e2ee/backup', { method: 'DELETE' }),
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
    resetPassword: (id: string, disableTwoFactor = true) => request<{ user: ModerationUser; temporaryPassword: string; delivery: 'miston' | 'email' | 'none'; deliveryError?: string }>(`/admin/users/${id}/password-reset`, { method: 'POST', body: { disableTwoFactor } }),
    disableTwoFactor: (id: string) => request<{ user: ModerationUser }>(`/admin/users/${id}/two-factor/disable`, { method: 'POST' }),
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
  meetings: {
    create: (title?: string) => request<{ meeting: { id: string; title: string; link: string } }>('/meetings', { method: 'POST', body: { title: title || 'Зустріч' } }),
    get: (id: string) => request<{ meeting: { id: string; title: string; link: string }; conversation?: Conversation }>(`/meetings/${id}`),
    join: (id: string) => request<{ meeting: { id: string; link: string }; conversation: Conversation | null }>(`/meetings/${id}/join`, { method: 'POST' }),
  },
  mistInbox: {
    list: () => request<{ items: { id: string; title: string; body: string; kind: string; read: boolean; createdAt: string }[]; unread: number }>('/mist-inbox'),
    markRead: (id: string) => request<{ ok: boolean }>(`/mist-inbox/${id}/read`, { method: 'POST' }),
    markAllRead: () => request<{ ok: boolean }>('/mist-inbox/read-all', { method: 'POST' }),
  },
  mistQr: {
    generate: () => request<{ token: string; expiresAt: string }>('/mist-qr/generate', { method: 'POST' }),
    verify: (token: string) => request<AuthResponse>('/mist-qr/verify', { method: 'POST', body: { token }, auth: false }),
    /** Новий пристрій створює короткоживучий запит і показує його як QR. */
    createLoginSession: () => request<{ token: string; expiresAt: string }>('/mist-qr/session', { method: 'POST', auth: false }),
    loginSessionStatus: (token: string) => request<{ status: 'pending' | 'approved'; auth?: AuthResponse }>('/mist-qr/session/status', { method: 'POST', body: { token }, auth: false }),
    /** Телефон, де вже увійшли, підтверджує сканований QR. */
    approveLoginSession: (token: string) => request<{ ok: boolean }>('/mist-qr/session/approve', { method: 'POST', body: { token } }),
  },
};

export type { ConversationKind };
