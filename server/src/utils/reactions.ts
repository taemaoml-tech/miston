// Keep this list and order in sync with client/src/utils/reactions.ts.
export const REACTION_EMOJIS = ['👍', '❤️', '🔥', '😂', '😮', '😢', '✅'] as const;
export type ReactionEmoji = typeof REACTION_EMOJIS[number];
