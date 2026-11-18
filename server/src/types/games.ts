export type GameKind = 'snake' | 'dice' | 'quiz';
export type GameStatus = 'inviting' | 'active' | 'finished' | 'cancelled' | 'expired';

export interface GamePlayer {
  userId: string;
  displayName: string;
  username: string;
  score: number;
  submittedAt: string | null;
}

export interface Game {
  id: string;
  conversationId: string;
  kind: GameKind;
  status: GameStatus;
  creatorId: string;
  opponentId: string;
  winnerId: string | null;
  state: Record<string, unknown>;
  players: GamePlayer[];
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export const GAME_INFO: Record<GameKind, {
  title: string;
  emoji: string;
  command: string;
  description: string;
  rule: string;
}> = {
  snake: {
    title: 'Змійка',
    emoji: '🐍',
    command: '/game_snake',
    description: 'Збери яблука за 30 секунд',
    rule: 'Перемагає той, хто збере більше яблук за 30 секунд.',
  },
  dice: {
    title: 'Костики',
    emoji: '🎲',
    command: '/game_dice',
    description: 'П\'ять кидків, найбільша сума',
    rule: 'Кожен кидає п\'ять разів. Перемагає найбільша сума очок.',
  },
  quiz: {
    title: 'Вікторина',
    emoji: '🧠',
    command: '/game_quiz',
    description: 'П\'ять запитань, найбільше балів',
    rule: 'П\'ять запитань: по одному балу за правильну відповідь.',
  },
};

export const GAME_KINDS = Object.keys(GAME_INFO) as GameKind[];

/** Запрошення діє 5 хвилин; активна гра — 20 хвилин. */
export const GAME_INVITE_TTL_MS = 5 * 60 * 1000;
export const GAME_ACTIVE_TTL_MS = 20 * 60 * 1000;
export const MAX_GAME_SCORE = 100_000;
