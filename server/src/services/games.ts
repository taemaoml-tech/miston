import { query } from '../db/pool';
import { getGame, createGame, updateGameStatus, submitGameScore, listGames } from '../db/games';
import { getMessageById } from '../db/messages';
import { emitGameInvite, emitGameUpdate, emitMessageNew } from '../sockets/emitter';
import { AppError, forbidden, notFound } from '../utils/errors';
import {
  GAME_ACTIVE_TTL_MS, GAME_INFO, GAME_INVITE_TTL_MS, MAX_GAME_SCORE,
  type Game, type GameKind,
} from '../types/games';

function ageMs(game: Game): number {
  return Date.now() - new Date(game.startedAt ?? game.createdAt).getTime();
}

function isExpired(game: Game): boolean {
  if (game.status === 'inviting') return ageMs(game) > GAME_INVITE_TTL_MS;
  if (game.status === 'active') return ageMs(game) > GAME_ACTIVE_TTL_MS;
  return false;
}

async function displayName(userId: string): Promise<string> {
  const result = await query<{ display_name: string; username: string }>(
    'SELECT display_name, username FROM users WHERE id = $1', [userId],
  );
  return result.rows[0]?.display_name || result.rows[0]?.username || 'Гравець';
}

async function createGameMessage(
  conversationId: string,
  senderId: string,
  game: Game | null,
  content: string,
): Promise<void> {
  const inserted = await query<{ id: string }>(
    `INSERT INTO messages (conversation_id, sender_id, kind, content, game_id)
     VALUES ($1, $2, 'game', $3, $4) RETURNING id`,
    [conversationId, senderId, content, game?.id ?? null],
  );
  const messageId = inserted.rows[0]?.id;
  if (!messageId) return;
  const members = await query<{ user_id: string }>(
    'SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id <> $2',
    [conversationId, senderId],
  );
  const message = await getMessageById(String(messageId));
  if (message) emitMessageNew(message, members.rows.map((row) => String(row.user_id)));
}

function broadcast(game: Game): void {
  emitGameUpdate(game, [game.creatorId, game.opponentId]);
}

/** Перевіряє, що гравець бере участь у грі та має право діяти. */
function assertPlayer(game: Game, userId: string): void {
  if (userId !== game.creatorId && userId !== game.opponentId) {
    throw forbidden('Ви не берете участі у цій грі');
  }
}

async function resolveOpponent(
  conversationId: string,
  senderId: string,
  username?: string,
): Promise<{ id: string } | null> {
  const result = await query<{ id: string; username: string }>(
    `SELECT u.id, u.username FROM conversation_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.conversation_id = $1 AND cm.user_id <> $2 AND u.is_bot = false`,
    [conversationId, senderId],
  );
  if (username) {
    const needle = username.replace(/^@/, '').toLowerCase();
    return result.rows.find((row) => String(row.username).toLowerCase() === needle) ?? null;
  }
  return result.rows.length === 1 ? result.rows[0] ?? null : null;
}

/** Команда /game_<name> у чаті створює запрошення для суперника. */
export async function handleGameCommand(
  conversationId: string,
  message: { kind: string; content: string },
  senderId: string,
): Promise<void> {
  if (message.kind !== 'text') return;
  const match = /^\s*\/game_(snake|dice|quiz)(?:\s+@?([a-zA-Z0-9_]{3,32}))?\s*$/i.exec(message.content);
  if (!match) return;

  const kind = match[1]!.toLowerCase() as GameKind;
  const info = GAME_INFO[kind];

  const recent = await query<{ id: string }>(
    `SELECT id FROM games
     WHERE conversation_id = $1 AND creator_id = $2 AND status = 'inviting'
       AND created_at > now() - interval '1 minute'`,
    [conversationId, senderId],
  );
  if (recent.rows.length > 0) {
    const pending = await getGame(String(recent.rows[0]!.id));
    await createGameMessage(conversationId, senderId, pending,
      `🎮 У вас уже є активне запрошення на «${info.title}». Прийміть його або скасуйте.`);
    return;
  }

  const opponent = await resolveOpponent(conversationId, senderId, match[2]);
  if (!opponent) {
    await createGameMessage(conversationId, senderId, null,
      `🎮 Для гри «${info.title}» потрібен суперник. У груповому чаті додайте @username.`);
    return;
  }
  if (String(opponent.id) === senderId) return;

  const game = await createGame({
    conversationId,
    kind,
    creatorId: senderId,
    opponentId: String(opponent.id),
    state: { inviteCommand: info.command },
  });
  const name = await displayName(senderId);
  await createGameMessage(
    conversationId,
    senderId,
    game,
    `${info.emoji} ${info.title}: ${name} запрошує на змагання! ${info.rule} Натисніть «Прийняти», щоб почати.`,
  );
  emitGameInvite(game, String(opponent.id));
}

export async function getGameForUser(id: string, userId: string): Promise<Game> {
  const game = await getGame(id);
  if (!game) throw notFound('Гру не знайдено');
  const member = await query(
    'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
    [game.conversationId, userId],
  );
  if (member.rowCount === 0) throw forbidden('Немає доступу до цієї гри');
  return game;
}

export async function listGamesForUser(userId: string, conversationId?: string, limit = 30): Promise<Game[]> {
  return listGames({ userId, conversationId, limit });
}

export async function acceptGame(id: string, userId: string): Promise<Game> {
  const game = await getGameForUser(id, userId);
  if (game.status !== 'inviting') throw new AppError(409, 'GAME_NOT_INVITING', 'Запрошення вже оброблено');
  if (game.opponentId !== userId) throw forbidden('Прийняти запрошення може лише суперник');
  if (isExpired(game)) {
    const expired = await updateGameStatus(id, 'expired') ?? game;
    broadcast(expired);
    throw new AppError(410, 'GAME_EXPIRED', 'Термін запрошення минув');
  }

  const active = await updateGameStatus(id, 'active') ?? game;
  await createGameMessage(game.conversationId, userId, active,
    `${GAME_INFO[active.kind].emoji} ${GAME_INFO[active.kind].title}: суперник прийняв запрошення — гру розпочато!`);
  broadcast(active);
  return active;
}

export async function cancelGame(id: string, userId: string): Promise<Game> {
  const game = await getGameForUser(id, userId);
  if (game.creatorId !== userId) throw forbidden('Скасувати гру може лише її автор');
  if (game.status !== 'inviting' && game.status !== 'active') {
    throw new AppError(409, 'GAME_ALREADY_FINISHED', 'Гру вже завершено');
  }
  const cancelled = await updateGameStatus(id, 'cancelled') ?? game;
  await createGameMessage(game.conversationId, userId, cancelled,
    `${GAME_INFO[game.kind].emoji} ${GAME_INFO[game.kind].title}: гру скасовано.`);
  broadcast(cancelled);
  return cancelled;
}

export async function submitScore(
  id: string,
  userId: string,
  rawScore: unknown,
  rawDetails: unknown,
): Promise<Game> {
  const game = await getGameForUser(id, userId);
  assertPlayer(game, userId);
  if (game.status !== 'active') throw new AppError(409, 'GAME_NOT_ACTIVE', 'Гра вже завершена або ще не почалася');
  if (isExpired(game)) {
    const expired = await updateGameStatus(id, 'expired') ?? game;
    broadcast(expired);
    throw new AppError(410, 'GAME_EXPIRED', 'Час гри минув');
  }

  const score = Math.min(MAX_GAME_SCORE, Math.max(0, Math.round(Number(rawScore) || 0)));
  const details = rawDetails && typeof rawDetails === 'object' && !Array.isArray(rawDetails)
    ? rawDetails as Record<string, unknown>
    : {};
  const serializedDetails = JSON.stringify(details).slice(0, 8000);
  let current = await submitGameScore({
    gameId: id, userId, score, details: JSON.parse(serializedDetails) as Record<string, unknown>,
  }) ?? game;

  if (current.players.length === 2 && current.players.every((player) => player.submittedAt)) {
    const [first, second] = current.players;
    const winnerId = first!.score === second!.score
      ? null
      : (first!.score > second!.score ? first!.userId : second!.userId);
    current = await updateGameStatus(id, 'finished', {
      winnerId,
      state: { ...current.state, finishedScores: current.players.map((p) => ({ userId: p.userId, score: p.score })) },
    }) ?? current;
    const info = GAME_INFO[current.kind];
    const resultText = winnerId
      ? `🏆 ${info.emoji} ${info.title}: ${winnerId === first!.userId ? first!.displayName : second!.displayName} перемагає — ${first!.score} : ${second!.score}!`
      : `🤝 ${info.emoji} ${info.title}: нічия — ${first!.score} : ${second!.score}.`;
    await createGameMessage(current.conversationId, current.creatorId, current, resultText);
  }

  broadcast(current);
  return current;
}
