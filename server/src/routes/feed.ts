import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { upload } from '../middleware/uploads';
import { uploadFile } from '../services/storage';
import { emitFeedNew } from '../sockets/emitter';
import { AppError, forbidden, notFound } from '../utils/errors';
import { asyncHandler } from '../utils/http';
import { cosmeticsFrom } from '../utils/serializers';

const router = Router();
router.use(requireAuth);

const categories = ['projects', 'polls', 'subscriptions'] as const;
type Category = (typeof categories)[number];

const categorySchema = z.enum(categories);
const textSchema = z.string().trim().max(2000).optional().default('');
const pollSchema = z.object({
  question: z.string().trim().min(1).max(140),
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(5),
});

/** multipart надсилає опитування рядком JSON, звичайний JSON — об'єктом. */
const optionalPoll = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}, pollSchema.optional());

const createSchema = z.object({
  text: textSchema,
  category: categorySchema.optional().default('projects'),
  poll: optionalPoll,
  imageUrl: z.string().trim().max(2000).optional(),
});

const emojiSchema = z.enum(['❤️', '🔥', '👏', '😂', '💡', '✨']);

const themeIdeas = [
  { question: 'Що сьогодні підняло вам настрій?', hint: 'Навіть дрібниця рахується — поділіться нею зі стрічкою ✨' },
  { question: 'Який маленький челендж візьмете на сьогодні?', hint: 'Напишіть одне речення — ми разом тримаємо темп 💪' },
  { question: 'Чим ви пишаєтеся цього тижня?', hint: 'Розкажіть про перемогу, яку ніхто не помітив 🌱' },
  { question: 'Що б ви порадили собі учорашньому?', hint: 'Одна порада — і день уже трохи легший 💬' },
  { question: 'Яку ідею хочете втілити найближчим часом?', hint: 'Великі плани починаються з одного рядка 🚀' },
  { question: 'Хто вас сьогодні надихнув?', hint: 'Тепла згадка — найкращий спосіб сказати «дякую» 💛' },
  { question: 'Що зробило б ваш день трохи затишнішим?', hint: 'Може, музика, чай чи коротка прогулянка ☕' },
];

interface PostRow {
  id: string;
  author_id: string;
  category: Category;
  text: string;
  image_url: string | null;
  poll: unknown;
  created_at: Date | string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
  is_verified: boolean;
  cosmetics: unknown;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function currentDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function themeFor(day: string) {
  const digits = day.replace(/\D/g, '').split('').reduce((sum, digit) => sum + Number(digit), 0);
  return themeIdeas[digits % themeIdeas.length]!;
}

async function loadTheme(userId: string, day = currentDay()) {
  const idea = themeFor(day);
  const [reply, participants] = await Promise.all([
    query<{ answer: string }>('SELECT answer FROM feed_theme_replies WHERE user_id = $1 AND day = $2::date', [userId, day]),
    query<{ count: string }>('SELECT COUNT(*)::text AS count FROM feed_theme_replies WHERE day = $1::date', [day]),
  ]);
  return {
    day,
    question: idea.question,
    hint: idea.hint,
    answer: reply.rows[0]?.answer ?? null,
    participants: Number(participants.rows[0]?.count ?? 0),
  };
}

function pollFrom(raw: unknown, counts: Map<string, Map<number, { count: number; mine: boolean }>>, postId: string) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const question = typeof value.question === 'string' ? value.question : '';
  const options = Array.isArray(value.options) ? value.options.filter((item): item is string => typeof item === 'string') : [];
  if (!question || options.length === 0) return null;
  const votes = counts.get(postId) ?? new Map<number, { count: number; mine: boolean }>();
  return {
    question,
    options: options.map((label, index) => ({
      index,
      label,
      votes: votes.get(index)?.count ?? 0,
    })),
    totalVotes: Array.from(votes.values()).reduce((sum, vote) => sum + vote.count, 0),
    myVote: Array.from(votes.entries()).find(([, vote]) => vote.mine)?.[0] ?? null,
  };
}

async function serializePosts(rows: PostRow[], viewerId: string) {
  const ids = rows.map((row) => String(row.id));
  if (ids.length === 0) return [];

  const [reactionRows, commentRows, voteRows] = await Promise.all([
    query<{ post_id: string; emoji: string; count: string; mine: boolean }>(
      `SELECT post_id, emoji, COUNT(*)::text AS count, BOOL_OR(user_id = $2) AS mine
       FROM feed_reactions WHERE post_id = ANY($1::uuid[])
       GROUP BY post_id, emoji ORDER BY count DESC, emoji ASC`,
      [ids, viewerId],
    ),
    query<{ post_id: string; count: string }>(
      'SELECT post_id, COUNT(*)::text AS count FROM feed_comments WHERE post_id = ANY($1::uuid[]) GROUP BY post_id',
      [ids],
    ),
    query<{ post_id: string; option_index: number; count: string; mine: boolean }>(
      `SELECT post_id, option_index, COUNT(*)::text AS count, BOOL_OR(user_id = $2) AS mine
       FROM feed_poll_votes WHERE post_id = ANY($1::uuid[])
       GROUP BY post_id, option_index`,
      [ids, viewerId],
    ),
  ]);

  const reactions = new Map<string, Array<{ emoji: string; count: number; mine: boolean }>>();
  for (const row of reactionRows.rows) {
    const list = reactions.get(String(row.post_id)) ?? [];
    list.push({ emoji: String(row.emoji), count: Number(row.count), mine: Boolean(row.mine) });
    reactions.set(String(row.post_id), list);
  }
  const comments = new Map(commentRows.rows.map((row) => [String(row.post_id), Number(row.count)]));
  const votes = new Map<string, Map<number, { count: number; mine: boolean }>>();
  for (const row of voteRows.rows) {
    const postVotes = votes.get(String(row.post_id)) ?? new Map<number, { count: number; mine: boolean }>();
    postVotes.set(Number(row.option_index), { count: Number(row.count), mine: Boolean(row.mine) });
    votes.set(String(row.post_id), postVotes);
  }

  return rows.map((row) => {
    const authorId = String(row.author_id);
    return {
      id: String(row.id),
      author: {
        id: authorId,
        username: String(row.username),
        displayName: String(row.display_name),
        avatarUrl: row.avatar_url == null ? null : String(row.avatar_url),
        // Преміум в Miston — це верифіковані та службові акаунти. Звичайні
        // акаунти отримують теплий статус «Крута людина» на боці клієнта.
        isPremium: row.role !== 'user' || Boolean(row.is_verified),
        isVerified: Boolean(row.is_verified),
        cosmetics: cosmeticsFrom(row.cosmetics),
      },
      category: row.category,
      text: String(row.text ?? ''),
      imageUrl: row.image_url == null ? null : String(row.image_url),
      poll: pollFrom(row.poll, votes, String(row.id)),
      reactions: reactions.get(String(row.id)) ?? [],
      commentCount: comments.get(String(row.id)) ?? 0,
      createdAt: iso(row.created_at),
    };
  });
}

const POST_SELECT = `
  SELECT p.id, p.author_id, p.category, p.text, p.image_url, p.poll, p.created_at,
         u.username, u.display_name, u.avatar_url, u.role, u.is_verified, u.cosmetics
  FROM feed_posts p
  JOIN users u ON u.id = p.author_id`;

async function loadPost(id: string, viewerId: string) {
  const found = await query<PostRow>(`${POST_SELECT} WHERE p.id = $1::uuid`, [id]);
  if (!found.rows[0]) throw notFound('Пост не знайдено');
  return (await serializePosts([found.rows[0]!], viewerId))[0]!;
}

async function loadFeed(userId: string, category: Category | null, before: string | null, limit: number) {
  const result = await query<PostRow>(
    `${POST_SELECT}
     WHERE ($2::text IS NULL OR p.category = $2)
       AND ($3::timestamptz IS NULL OR p.created_at < $3::timestamptz)
       AND (
         $4::boolean = false
         OR p.author_id = $1::uuid
         OR EXISTS (
           SELECT 1 FROM friendships f
           WHERE f.status = 'accepted'
             AND ((f.requester_id = $1::uuid AND f.addressee_id = p.author_id)
               OR (f.addressee_id = $1::uuid AND f.requester_id = p.author_id))
         )
       )
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT $5`,
    [userId, category, before, category === 'subscriptions', limit],
  );
  return serializePosts(result.rows, userId);
}

function parseImageUrl(value: string | undefined): string | null {
  if (!value) return null;
  if (/^\/uploads\/[A-Za-z0-9._-]+$/.test(value) || /^https:\/\//i.test(value)) return value;
  throw new AppError(400, 'INVALID_IMAGE', 'Некоректне посилання на зображення');
}

router.get('/', asyncHandler(async (req, res) => {
  const userId = req.auth!.userId;
  const category = req.query.category === undefined
    ? null
    : categorySchema.parse(String(req.query.category));
  const before = req.query.before ? String(req.query.before) : null;
  const limit = Math.min(40, Math.max(1, Number(req.query.limit) || 20));
  const [posts, theme] = await Promise.all([
    loadFeed(userId, category, before, limit),
    before ? Promise.resolve(null) : loadTheme(userId),
  ]);
  res.json({ posts, hasMore: posts.length === limit, theme });
}));

router.get('/theme', asyncHandler(async (req, res) => {
  res.json({ theme: await loadTheme(req.auth!.userId) });
}));

router.post('/theme', asyncHandler(async (req, res) => {
  const { answer } = z.object({ answer: z.string().trim().min(1).max(280) }).parse(req.body);
  const day = currentDay();
  await query(
    `INSERT INTO feed_theme_replies (user_id, day, answer) VALUES ($1, $2::date, $3)
     ON CONFLICT (user_id) DO UPDATE SET day = EXCLUDED.day, answer = EXCLUDED.answer, updated_at = now()`,
    [req.auth!.userId, day, answer],
  );
  res.json({ theme: await loadTheme(req.auth!.userId, day) });
}));

/** Свіжі пости для плаваючої кнопки, якщо сокет був недоступний. */
router.get('/since', asyncHandler(async (req, res) => {
  const after = z.string().min(1).parse(String(req.query.after ?? ''));
  const result = await query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM feed_posts WHERE author_id <> $1 AND created_at > $2::timestamptz',
    [req.auth!.userId, after],
  );
  res.json({ count: Number(result.rows[0]?.count ?? 0) });
}));

router.post('/', upload.single('image'), asyncHandler(async (req, res) => {
  const userId = req.auth!.userId;
  let input: z.infer<typeof createSchema>;
  try {
    input = createSchema.parse({ ...req.body, imageUrl: req.file ? undefined : req.body?.imageUrl });
  } catch (error) {
    if (req.file) {
      const { removeUpload } = await import('../middleware/uploads');
      await removeUpload(req.file.filename);
    }
    throw error;
  }

  const imageUrl = req.file
    ? await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype)
    : parseImageUrl(input.imageUrl);
  if (!input.text.trim() && !imageUrl && !input.poll) {
    throw new AppError(400, 'EMPTY_POST', 'Додайте текст, зображення або опитування');
  }

  const inserted = await query<{ id: string }>(
    `INSERT INTO feed_posts (author_id, category, text, image_url, poll)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [userId, input.category, input.text, imageUrl, input.poll ? JSON.stringify(input.poll) : null],
  );
  const post = await loadPost(String(inserted.rows[0]!.id), userId);
  emitFeedNew({ id: post.id, authorId: userId, category: post.category, createdAt: post.createdAt });
  res.status(201).json({ post });
}));

router.post('/:id/reactions', asyncHandler(async (req, res) => {
  const postId = z.string().uuid().parse(req.params.id);
  const emoji = emojiSchema.parse(req.body?.emoji);
  const userId = req.auth!.userId;
  const existing = await query(
    'DELETE FROM feed_reactions WHERE post_id = $1::uuid AND user_id = $2 AND emoji = $3',
    [postId, userId, emoji],
  );
  if (existing.rowCount === 0) {
    await query('INSERT INTO feed_reactions (post_id, user_id, emoji) VALUES ($1::uuid, $2, $3) ON CONFLICT DO NOTHING', [postId, userId, emoji]);
  }
  res.json({ post: await loadPost(String(postId), userId) });
}));

router.get('/:id/comments', asyncHandler(async (req, res) => {
  const postId = z.string().uuid().parse(req.params.id);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const result = await query<{
    id: string; author_id: string; text: string; created_at: Date | string;
    username: string; display_name: string; avatar_url: string | null;
    role: string; is_verified: boolean; cosmetics: unknown;
  }>(
    `SELECT c.id, c.author_id, c.text, c.created_at,
            u.username, u.display_name, u.avatar_url, u.is_verified, u.role, u.cosmetics
     FROM feed_comments c JOIN users u ON u.id = c.author_id
     WHERE c.post_id = $1::uuid ORDER BY c.created_at ASC, c.id ASC LIMIT $2`,
    [postId, limit],
  );
  res.json({
    comments: result.rows.map((row) => ({
      id: String(row.id),
      postId: String(postId),
      author: {
        id: String(row.author_id),
        username: String(row.username),
        displayName: String(row.display_name),
        avatarUrl: row.avatar_url == null ? null : String(row.avatar_url),
        isPremium: row.role !== 'user' || Boolean(row.is_verified),
        isVerified: Boolean(row.is_verified),
        cosmetics: cosmeticsFrom(row.cosmetics),
      },
      text: String(row.text),
      createdAt: iso(row.created_at),
    })),
  });
}));

router.post('/:id/comments', asyncHandler(async (req, res) => {
  const postId = z.string().uuid().parse(req.params.id);
  const text = z.string().trim().min(1).max(1000).parse(req.body?.text);
  const userId = req.auth!.userId;
  const inserted = await query<{ id: string }>(
    'INSERT INTO feed_comments (post_id, author_id, text) VALUES ($1::uuid, $2, $3) RETURNING id',
    [postId, userId, text],
  );
  const comments = await query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM feed_comments WHERE post_id = $1::uuid',
    [postId],
  );
  res.status(201).json({ commentId: String(inserted.rows[0]!.id), commentCount: Number(comments.rows[0]?.count ?? 0) });
}));

router.post('/:id/vote', asyncHandler(async (req, res) => {
  const postId = z.string().uuid().parse(req.params.id);
  const optionIndex = z.number().int().min(0).max(4).parse(req.body?.optionIndex);
  const userId = req.auth!.userId;
  const post = await query<{ poll: unknown }>('SELECT poll FROM feed_posts WHERE id = $1::uuid', [postId]);
  if (!post.rows[0]) throw notFound('Пост не знайдено');
  const options = pollFrom(post.rows[0].poll, new Map(), String(postId));
  if (!options || optionIndex >= options.options.length) throw new AppError(400, 'INVALID_POLL_OPTION', 'Варіант опитування не знайдено');

  const existing = await query<{ option_index: number }>(
    'SELECT option_index FROM feed_poll_votes WHERE post_id = $1::uuid AND user_id = $2',
    [postId, userId],
  );
  if (existing.rows[0]?.option_index === optionIndex) {
    await query('DELETE FROM feed_poll_votes WHERE post_id = $1::uuid AND user_id = $2', [postId, userId]);
  } else {
    await query(
      `INSERT INTO feed_poll_votes (post_id, user_id, option_index) VALUES ($1::uuid, $2, $3)
       ON CONFLICT (post_id, user_id) DO UPDATE SET option_index = EXCLUDED.option_index`,
      [postId, userId, optionIndex],
    );
  }
  res.json({ post: await loadPost(String(postId), userId) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const postId = z.string().uuid().parse(req.params.id);
  const userId = req.auth!.userId;
  const found = await query<{ author_id: string; image_url: string | null }>(
    'SELECT author_id, image_url FROM feed_posts WHERE id = $1::uuid',
    [postId],
  );
  const post = found.rows[0];
  if (!post) throw notFound('Пост не знайдено');
  if (String(post.author_id) !== userId) throw forbidden('Видаляти пост може лише його автор');
  await query('DELETE FROM feed_posts WHERE id = $1::uuid', [postId]);
  if (post.image_url) {
    const filename = String(post.image_url).startsWith('/uploads/')
      ? String(post.image_url).slice('/uploads/'.length)
      : undefined;
    if (filename && /^[A-Za-z0-9._-]+$/.test(filename)) {
      const { removeUpload } = await import('../middleware/uploads');
      await removeUpload(filename);
    }
  }
  res.json({ ok: true });
}));

export default router;
