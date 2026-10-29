import type {
  Attachment, Message, MessageReaction, PublicUser, Sender, StarCosmetics,
  Sticker, StickerCategory, StickerPack, UserProfile,
} from '../types/domain';

function isoDate(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function nullableIsoDate(value: unknown): string | null {
  return value == null ? null : isoDate(value);
}

export function cosmeticsFrom(value: unknown): StarCosmetics {
  if (value == null) return {};
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed as StarCosmetics : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? value as StarCosmetics : {};
}

export function serializeUser(row: Record<string, unknown>, online?: boolean): PublicUser {
  return {
    id: String(row.id),
    email: String(row.email),
    username: String(row.username),
    displayName: String(row.display_name),
    avatarUrl: row.avatar_url == null ? null : String(row.avatar_url),
    bio: String(row.bio ?? ''),
    role: row.role as PublicUser['role'],
    isVerified: Boolean(row.is_verified),
    cosmetics: cosmeticsFrom(row.cosmetics),
    ...(online === undefined ? {} : { online }),
    lastSeenAt: isoDate(row.last_seen_at),
    createdAt: isoDate(row.created_at),
    updatedAt: isoDate(row.updated_at),
  };
}

export function serializeSender(row: Record<string, unknown>): Sender {
  return {
    id: String(row.sender_id ?? row.id),
    username: String(row.sender_username ?? row.username),
    displayName: String(row.sender_display_name ?? row.display_name),
    avatarUrl: (row.sender_avatar_url ?? row.avatar_url) == null
      ? null
      : String(row.sender_avatar_url ?? row.avatar_url),
    isVerified: Boolean(row.sender_is_verified ?? row.is_verified),
    cosmetics: cosmeticsFrom(row.sender_cosmetics ?? row.cosmetics),
  };
}

export function serializeProfile(
  row: Record<string, unknown>,
  friendship: UserProfile['friendship'],
  online?: boolean,
): UserProfile {
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    avatarUrl: row.avatar_url == null ? null : String(row.avatar_url),
    bio: String(row.bio ?? ''),
    role: row.role as UserProfile['role'],
    isVerified: Boolean(row.is_verified),
    cosmetics: cosmeticsFrom(row.cosmetics),
    ...(online === undefined ? {} : { online }),
    lastSeenAt: isoDate(row.last_seen_at),
    createdAt: isoDate(row.created_at),
    friendship,
  };
}

export function serializeSticker(row: Record<string, unknown>): Sticker {
  return {
    id: String(row.id),
    packId: String(row.pack_id),
    slug: String(row.slug),
    label: String(row.label),
    keywords: String(row.keywords ?? ''),
    asset: String(row.asset),
    animation: String(row.animation ?? ''),
    width: Number(row.width ?? 320),
    height: Number(row.height ?? 320),
  };
}

export function serializeStickerPack(row: Record<string, unknown>, stickers: Sticker[], isOwned: boolean): StickerPack {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: String(row.description ?? ''),
    category: row.category as StickerCategory,
    coverAsset: String(row.cover_asset ?? ''),
    isAnimated: Boolean(row.is_animated),
    isOwned,
    isPublic: Boolean(row.is_public),
    stickers,
  };
}

export function serializeMessage(row: Record<string, unknown>): Message {
  const rawAttachments = (row.attachments ?? []) as Array<Record<string, unknown>>;
  const attachments: Attachment[] = rawAttachments.map((attachment) => ({
    id: String(attachment.id),
    url: String(attachment.url ?? attachment.storage_path),
    originalName: String(attachment.originalName ?? attachment.original_name),
    mimeType: String(attachment.mimeType ?? attachment.mime_type),
    sizeBytes: Number(attachment.sizeBytes ?? attachment.size_bytes),
    createdAt: isoDate(attachment.createdAt ?? attachment.created_at),
  }));

  const rawReactions = (row.reactions ?? []) as Array<Record<string, unknown>>;
  const reactions: MessageReaction[] = rawReactions.map((reaction) => ({
    emoji: String(reaction.emoji),
    userIds: Array.isArray(reaction.userIds) ? reaction.userIds.map(String) : [],
  }));

  const rawReply = row.reply_to as Record<string, unknown> | null | undefined;
  const rawForward = row.forwarded_from as Record<string, unknown> | null | undefined;
  const rawSticker = row.sticker as Record<string, unknown> | null | undefined;

  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    senderId: String(row.sender_id),
    kind: row.kind as Message['kind'],
    content: String(row.content),
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    createdAt: isoDate(row.created_at),
    editedAt: nullableIsoDate(row.edited_at),
    pinnedAt: nullableIsoDate(row.pinned_at),
    pinnedBy: row.pinned_by == null ? null : String(row.pinned_by),
    attachments,
    reactions,
    sender: serializeSender(row),
    readBy: Array.isArray(row.read_by) ? row.read_by.map(String) : [],
    replyTo: rawReply ? {
      id: String(rawReply.id),
      senderId: String(rawReply.senderId),
      senderName: String(rawReply.senderName),
      content: String(rawReply.content ?? ''),
      kind: rawReply.kind as Message['kind'],
      deleted: Boolean(rawReply.deleted),
    } : null,
    forwardedFrom: rawForward ? {
      userId: String(rawForward.userId),
      username: String(rawForward.username),
      displayName: String(rawForward.displayName),
      conversationId: rawForward.conversationId == null ? null : String(rawForward.conversationId),
      conversationTitle: rawForward.conversationTitle == null ? null : String(rawForward.conversationTitle),
    } : null,
    mentions: Array.isArray(row.mentions) ? row.mentions.map(String) : [],
    sticker: rawSticker ? {
      id: String(rawSticker.id),
      slug: String(rawSticker.slug),
      label: String(rawSticker.label ?? ''),
      asset: String(rawSticker.asset),
      animation: String(rawSticker.animation ?? ''),
      packName: String(rawSticker.packName ?? ''),
      packSlug: String(rawSticker.packSlug ?? ''),
      category: rawSticker.category as StickerCategory,
    } : null,
  };
}
