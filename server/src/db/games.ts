import { query } from './pool';
import type { Game, GameKind, GamePlayer } from '../types/games';

const GAME_COLUMNS = `
  g.*,
  COALESCE((
    SELECT json_agg(json_build_object(
      'userId', u.id,
      'displayName', u.display_name,
      'username', u.username,
      'score', gp.score,
      'submittedAt', gp.submitted_at
    ) ORDER BY (gp.user_id = g.creator_id) DESC)
    FROM game_players gp JOIN users u ON u.id = gp.user_id
    WHERE gp.game_id = g.id
  ), '[]'::json) AS players`;

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function nullableIso(value: unknown): string | null {
  return value == null ? null : iso(value);
}

export function serializeGame(row: Record<string, unknown>): Game {
  const state = row.state;
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    kind: String(row.kind) as GameKind,
    status: String(row.status) as Game['status'],
    creatorId: String(row.creator_id),
    opponentId: String(row.opponent_id),
    winnerId: row.winner_id == null ? null : String(row.winner_id),
    state: typeof state === 'object' && state !== null ? state as Record<string, unknown> : {},
    players: Array.isArray(row.players) ? (row.players as GamePlayer[]) : [],
    createdAt: iso(row.created_at),
    startedAt: nullableIso(row.started_at),
    finishedAt: nullableIso(row.finished_at),
  };
}

export async function getGame(id: string): Promise<Game | null> {
  const result = await query<Record<string, unknown>>(
    `SELECT ${GAME_COLUMNS} FROM games g WHERE g.id = $1`,
    [id],
  );
  return result.rows[0] ? serializeGame(result.rows[0]) : null;
}

export async function listGames(options: {
  userId?: string | undefined;
  conversationId?: string | undefined;
  limit?: number | undefined;
}): Promise<Game[]> {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (options.userId) {
    values.push(options.userId);
    clauses.push(`(g.creator_id = $${values.length} OR g.opponent_id = $${values.length})`);
  }
  if (options.conversationId) {
    values.push(options.conversationId);
    clauses.push(`g.conversation_id = $${values.length}`);
  }
  values.push(Math.min(Math.max(options.limit ?? 30, 1), 100));
  const limitParam = `$${values.length}`;
  const result = await query<Record<string, unknown>>(
    `SELECT ${GAME_COLUMNS} FROM games g
     ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
     ORDER BY g.created_at DESC LIMIT ${limitParam}`,
    values,
  );
  return result.rows.map(serializeGame);
}

export async function createGame(input: {
  conversationId: string;
  kind: GameKind;
  creatorId: string;
  opponentId: string;
  state?: Record<string, unknown>;
}): Promise<Game> {
  const result = await query<{ id: string }>(
    `INSERT INTO games (conversation_id, kind, creator_id, opponent_id, state)
     VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
    [input.conversationId, input.kind, input.creatorId, input.opponentId, JSON.stringify(input.state ?? {})],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('Game insert returned no row');
  await query(
    `INSERT INTO game_players (game_id, user_id) VALUES ($1, $2), ($1, $3)
     ON CONFLICT (game_id, user_id) DO NOTHING`,
    [id, input.creatorId, input.opponentId],
  );
  const game = await getGame(String(id));
  if (!game) throw new Error('Failed to load created game');
  return game;
}

export async function updateGameStatus(
  id: string,
  status: Game['status'],
  extra: { winnerId?: string | null; state?: Record<string, unknown> } = {},
): Promise<Game | null> {
  await query(
    `UPDATE games
     SET status = $2,
         winner_id = CASE WHEN $3::boolean THEN $4::uuid ELSE winner_id END,
         state = CASE WHEN $5::boolean THEN $6::jsonb ELSE state END,
         started_at = CASE WHEN $2 = 'active' AND started_at IS NULL THEN now() ELSE started_at END,
         finished_at = CASE WHEN $2 IN ('finished', 'cancelled', 'expired') THEN now() ELSE finished_at END
     WHERE id = $1`,
    [
      id, status,
      'winnerId' in extra, extra.winnerId ?? null,
      'state' in extra, JSON.stringify(extra.state ?? {}),
    ],
  );
  return getGame(id);
}

export async function submitGameScore(input: {
  gameId: string;
  userId: string;
  score: number;
  details: Record<string, unknown>;
}): Promise<Game | null> {
  await query(
    `UPDATE game_players
     SET score = $3, details = $4::jsonb, submitted_at = now()
     WHERE game_id = $1 AND user_id = $2`,
    [input.gameId, input.userId, input.score, JSON.stringify(input.details)],
  );
  // Детальна історія ходів зберігається окремо від підсумкового рахунку.
  await query(
    `INSERT INTO game_moves (game_id, user_id, round, payload)
     VALUES ($1, $2, 0, $3::jsonb)`,
    [input.gameId, input.userId, JSON.stringify({ score: input.score, ...input.details })],
  ).catch((error) => console.error('Failed to save game move', error));
  return getGame(input.gameId);
}
