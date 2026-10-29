export type UserRole = 'user' | 'moderator' | 'owner';
export type FriendshipState = 'self' | 'none' | 'incoming' | 'outgoing' | 'friends';
export type FriendshipEventType = 'request' | 'accepted' | 'declined' | 'cancelled' | 'removed';

export type StarCategory = 'profile' | 'chats' | 'emoji' | 'collections';
export type StarRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'seasonal';
export type StarItemType =
  | 'profile_frame' | 'nickname_color' | 'avatar_effect' | 'profile_background' | 'badge'
  | 'chat_background' | 'theme' | 'message_effect' | 'notification_sound'
  | 'emoji_pack' | 'sticker_pack' | 'collection';

export interface StarCosmetic {
  itemId: string;
  name: string;
  icon: string;
  type: StarItemType;
  config: Record<string, unknown>;
}

export type StarCosmetics = Record<string, StarCosmetic>;

export interface StarWallet {
  balance: number;
  xp: number;
  level: number;
  messageCount: number;
  activeDays: number;
  lastDailyClaim: string | null;
  levelProgress: {
    level: number;
    currentLevelXp: number;
    nextLevelXp: number;
    xpIntoLevel: number;
    xpForNext: number;
    percent: number;
    maxLevel: boolean;
  };
  daily: { reward: number; canClaim: boolean; claimedToday: boolean };
}

export interface StarReward {
  id: string;
  amount: number;
  reason: string;
  description: string;
  balanceAfter: number;
  createdAt: string;
}

export interface StarAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  metric: 'messages' | 'active_days' | 'level';
  threshold: number;
  reward: number;
  rarity: StarRarity;
  current: number;
  progress: number;
  unlocked: boolean;
  unlockedAt: string | null;
}

export interface StarItem {
  id: string;
  name: string;
  description: string;
  category: StarCategory;
  type: StarItemType;
  price: number;
  rarity: StarRarity;
  levelRequired: number;
  slot: string | null;
  icon: string;
  config: Record<string, unknown>;
  owned: boolean;
  equipped: boolean;
  levelLocked: boolean;
  canAfford: boolean;
  acquiredAt: string | null;
}

export interface StarUpdate {
  wallet: StarWallet;
  rewards: StarReward[];
  achievements: StarAchievement[];
}

export interface StarOverview {
  wallet: StarWallet;
  achievements: StarAchievement[];
  equipped: StarCosmetics;
  recentTransactions: StarReward[];
  stats: { catalog: number; owned: number; unlockedAchievements: number; totalAchievements: number };
}

export interface StarShopResponse {
  items: StarItem[];
  counts: Record<StarCategory, number>;
  wallet: StarWallet;
}

export interface StarInventoryResponse {
  items: StarItem[];
  wallet: StarWallet;
}

export interface StarPurchaseResponse extends StarUpdate {
  item: StarItem;
  equipped: StarCosmetics;
}

export interface StarEquipResponse {
  equipped: StarCosmetics;
  inventory: StarInventoryResponse;
}

export interface User {
  id: string;
  email?: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  bio?: string | null;
  role: UserRole;
  isVerified?: boolean;
  cosmetics?: StarCosmetics;
  online?: boolean;
  lastSeenAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  bio: string;
  role: UserRole;
  isVerified?: boolean;
  cosmetics?: StarCosmetics;
  online?: boolean;
  lastSeenAt: string;
  createdAt: string;
  friendship: FriendshipState;
}

export interface FriendProfile extends UserProfile {
  friendsSince: string;
  alias?: string | null;
}

export interface FriendRequestProfile extends UserProfile {
  requestedAt: string;
}

export interface FriendsOverview {
  friends: FriendProfile[];
  incoming: FriendRequestProfile[];
  outgoing: FriendRequestProfile[];
}

export interface FriendshipActor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface FriendshipEvent {
  type: FriendshipEventType;
  actor: FriendshipActor;
}

export interface MessageSender {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  cosmetics?: StarCosmetics;
  isVerified?: boolean;
}

export type CallKind = 'audio' | 'video';
export type CallEndReason = 'timeout' | 'declined' | 'left' | 'ended';
export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active';

export interface CallParticipant {
  userId: string;
  user: MessageSender;
  mic: boolean;
  camera: boolean;
  screen: boolean;
}

export interface CallConversation {
  id: string;
  kind: ConversationKind;
  title: string | null;
  avatarUrl?: string | null;
}

export interface CallInfo {
  id: string;
  conversationId: string;
  conversation: CallConversation;
  kind: CallKind;
  initiatorId: string;
  participants: CallParticipant[];
  startedAt: string;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export type ConversationKind = 'direct' | 'group' | 'channel';
export type CleanupScope = 'me' | 'everyone';
export type MessageKind = 'text' | 'image' | 'video' | 'video_note' | 'document' | 'voice' | 'sticker';

export type StickerCategory =
  | 'emotions' | 'memes' | 'animals' | 'games' | 'holidays' | 'anime' | 'reactions' | 'custom';

export interface Sticker {
  id: string;
  packId: string;
  slug: string;
  label: string;
  keywords: string;
  asset: string;
  animation: string;
  width: number;
  height: number;
}

export interface StickerPack {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: StickerCategory;
  coverAsset: string;
  isAnimated: boolean;
  isOwned: boolean;
  isPublic: boolean;
  stickers: Sticker[];
}

export interface StickerLibrary {
  categories: { key: StickerCategory; name: string }[];
  packs: StickerPack[];
  favorites: string[];
  recents: string[];
}

export interface MessageSticker {
  id: string;
  slug: string;
  label: string;
  asset: string;
  animation: string;
  packName: string;
  packSlug: string;
  category: StickerCategory;
}

export interface Attachment {
  id: string;
  url: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface MessageReaction {
  emoji: string;
  userIds: string[];
}

export interface MessageReply {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  kind: MessageKind;
  deleted: boolean;
}

export interface MessageForward {
  userId: string;
  username: string;
  displayName: string;
  conversationId: string | null;
  conversationTitle: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  sender: MessageSender;
  content: string;
  kind: MessageKind;
  durationSeconds?: number | null;
  createdAt: string;
  editedAt?: string | null;
  pinnedAt?: string | null;
  pinnedBy?: string | null;
  attachments: Attachment[];
  reactions?: MessageReaction[];
  readBy?: string[];
  sticker?: MessageSticker | null;
  replyTo?: MessageReply | null;
  forwardedFrom?: MessageForward | null;
  mentions?: string[];
}

export interface ConversationMember extends MessageSender {
  role: 'owner' | 'admin' | 'member';
  lastReadMessageId?: string | null;
  online?: boolean;
  bio?: string;
  alias?: string | null;
}

export interface Conversation {
  id: string;
  kind: ConversationKind;
  title: string;
  avatarUrl?: string | null;
  members: ConversationMember[];
  lastMessage?: Message | null;
  unreadCount: number;
  updatedAt?: string;
  serverId?: string | null;
}

export interface Channel {
  id: string;
  serverId?: string;
  kind?: 'channel';
  title: string;
  avatarUrl?: string | null;
  createdAt?: string;
  unreadCount?: number;
}

export interface ServerMember extends MessageSender {
  role: string;
  joinedAt?: string;
}

export interface CommunityServer {
  id: string;
  name: string;
  iconUrl?: string | null;
  avatarUrl?: string | null;
  ownerId?: string;
  role?: string;
  channels: Channel[];
  members: ServerMember[];
  memberCount: number;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: User;
}

export interface MessagePage {
  items: Message[];
  nextCursor: string | null;
}

export interface TypingEvent {
  conversationId: string;
  userId: string;
  isTyping: boolean;
  user?: User;
}

export interface PresenceEvent {
  userId: string;
  online?: boolean;
  isOnline?: boolean;
  lastSeenAt?: string | null;
}

export interface AppNotification {
  id: string;
  title: string;
  body?: string;
  conversationId?: string;
  createdAt: number;
}

export interface AdminStats {
  users: { total: number; online: number; blocked: number; verified: number; moderators: number };
  content: { messages: number; conversations: number; servers: number; stickers: number };
  moderation: { complaintsNew: number; complaintsInProgress: number; actionsLast24h: number };
  economy: { starsInCirculation: number; transactionsLast24h: number };
}

export type AdminCapability =
  | 'panel.open' | 'user.view' | 'user.block' | 'user.delete' | 'user.verify' | 'star.manage'
  | 'staff.manage' | 'stats.view' | 'audit.view' | 'notification.send' | 'complaint.view'
  | 'complaint.manage' | 'message.delete';

export interface AdminOverview {
  role: UserRole;
  roleLabel: string;
  capabilities: AdminCapability[];
  stats: AdminStats;
}

export interface ModerationUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  email: string;
  role: UserRole;
  isVerified: boolean;
  starBalance: number;
  messageCount: number;
  createdAt: string;
  lastSeenAt: string;
  online: boolean;
  blockedAt: string | null;
  blockedUntil: string | null;
  blockedReason: string;
}

export type ComplaintCategory = 'spam' | 'harassment' | 'nsfw' | 'scam' | 'copyright' | 'other';
export type ComplaintStatus = 'new' | 'in_progress' | 'closed';

export interface Complaint {
  id: string;
  category: ComplaintCategory;
  description: string;
  status: ComplaintStatus;
  resolution: string;
  complainant: MessageSender;
  targetUser: MessageSender | null;
  messageId: string | null;
  conversationId: string | null;
  messagePreview: string | null;
  createdAt: string;
  updatedAt: string;
  handledAt: string | null;
}

export type SupportStatus = ComplaintStatus;
export type SupportTopic = 'account' | 'technical' | 'report' | 'star' | 'feedback' | 'other';

export interface SupportRequest {
  id: string;
  topic: SupportTopic;
  message: string;
  status: ComplaintStatus;
  resolution: string;
  contactEmail: string | null;
  requester: MessageSender | null;
  createdAt: string;
  handledAt: string | null;
}

export type AdminAction =
  | 'user.block' | 'user.unblock' | 'user.delete' | 'user.verify' | 'user.unverify'
  | 'star.grant' | 'star.remove' | 'role.grant' | 'role.revoke'
  | 'complaint.status' | 'message.delete' | 'notification.send' | 'support.status';

export interface AdminActionLog {
  id: string;
  action: AdminAction;
  actor: (MessageSender & { role: UserRole }) | null;
  targetUser: MessageSender | null;
  targetId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface StarHistoryEntry {
  id: string;
  amount: number;
  reason: string;
  description: string;
  balanceAfter: number;
  createdAt: string;
  actorName: string | null;
  actorRole: UserRole | null;
}

export interface SystemNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface SentNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  recipients: number;
  read: number;
}
