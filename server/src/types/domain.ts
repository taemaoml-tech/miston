export type UserRole = 'user' | 'moderator' | 'owner';
export type ConversationKind = 'direct' | 'group' | 'channel';
export type MessageKind = 'text' | 'image' | 'video' | 'video_note' | 'document' | 'voice' | 'sticker';
export type FriendshipState = 'self' | 'none' | 'incoming' | 'outgoing' | 'friends';
export type FriendshipEventType = 'request' | 'accepted' | 'declined' | 'cancelled' | 'removed';

export type StickerCategory =
  | 'emotions' | 'memes' | 'animals' | 'games' | 'holidays' | 'anime' | 'reactions' | 'custom';

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

export interface StarAchievementView {
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

export interface StarItemView {
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
  achievements: StarAchievementView[];
}

export interface StarOverview extends Omit<StarUpdate, 'rewards'> {
  equipped: StarCosmetics;
  recentTransactions: StarReward[];
  stats: { catalog: number; owned: number; unlockedAchievements: number; totalAchievements: number };
}

export interface AuthContext {
  userId: string;
  role: UserRole;
}

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  role: UserRole;
  isVerified: boolean;
  cosmetics: StarCosmetics;
  online?: boolean;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Sender {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified?: boolean;
  cosmetics?: StarCosmetics;
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

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  role: UserRole;
  isVerified: boolean;
  cosmetics: StarCosmetics;
  online?: boolean;
  lastSeenAt: string;
  createdAt: string;
  friendship: FriendshipState;
}

export interface FriendProfile extends UserProfile {
  friendsSince: string;
  alias: string | null;
}

export interface FriendRequestProfile extends UserProfile {
  requestedAt: string;
}

export interface FriendshipEvent {
  type: FriendshipEventType;
  actor: Sender;
}

export type CallKind = 'audio' | 'video';
export type CallEndReason = 'timeout' | 'declined' | 'left' | 'ended';

export interface CallParticipant {
  userId: string;
  user: Sender;
  mic: boolean;
  camera: boolean;
  screen: boolean;
}

export interface CallConversation {
  id: string;
  kind: ConversationKind;
  title: string | null;
  avatarUrl: string | null;
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

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  kind: MessageKind;
  content: string;
  durationSeconds: number | null;
  createdAt: string;
  editedAt: string | null;
  pinnedAt: string | null;
  pinnedBy: string | null;
  attachments: Attachment[];
  reactions: MessageReaction[];
  sender: Sender;
  readBy: string[];
  sticker: MessageSticker | null;
  replyTo: MessageReply | null;
  forwardedFrom: MessageForward | null;
  mentions: string[];
}

export type ComplaintCategory = 'spam' | 'harassment' | 'nsfw' | 'scam' | 'copyright' | 'other';
export type ComplaintStatus = 'new' | 'in_progress' | 'closed';

export interface Complaint {
  id: string;
  category: ComplaintCategory;
  description: string;
  status: ComplaintStatus;
  resolution: string;
  complainant: Sender;
  targetUser: Sender | null;
  messageId: string | null;
  conversationId: string | null;
  messagePreview: string | null;
  createdAt: string;
  updatedAt: string;
  handledAt: string | null;
}

export type AdminAction =
  | 'user.block'
  | 'user.unblock'
  | 'user.delete'
  | 'user.verify'
  | 'user.unverify'
  | 'star.grant'
  | 'star.remove'
  | 'role.grant'
  | 'role.revoke'
  | 'complaint.status'
  | 'message.delete'
  | 'notification.send'
  | 'support.status';

export interface AdminActionLog {
  id: string;
  action: AdminAction;
  actor: (Sender & { role: UserRole }) | null;
  targetUser: Sender | null;
  targetId: string;
  details: Record<string, unknown>;
  createdAt: string;
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

export interface SystemNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}
