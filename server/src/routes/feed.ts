import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { feedUpload } from '../middleware/uploads';
import { signFeedVideoUpload } from '../services/directUpload';
import { uploadFile } from '../services/storage';
import { emitFeedNew } from '../sockets/emitter';
import { AppError, forbidden, notFound } from '../utils/errors';
import { asyncHandler } from '../utils/http';
import { cosmeticsFrom } from '../utils/serializers';

const router = Router();
router.use(requireAuth);

const categories = ['general', 'polls', 'subscriptions', 'shorts', 'longs'] as const;
type Category = (typeof categories)[number];

/** Відео до хвилини — у загальній стрічці, довші — лише у вкладці «Довгі». */
const SHORT_VIDEO_MAX_SECONDS = 60;
const MAX_MEDIA = 10;

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

const mediaItemSchema = z.object({
  type: z.enum(['image', 'video']),
  url: z.string().trim().max(2000),
  duration: z.coerce.number().int().min(1).max(14400).optional().nullable(),
});
const optionalMedia = z.preprocess((value) => {
  const raw = value == null ? [] : Array.isArray(value) ? value : [value];
  return raw.map((item) => {
    if (typeof item !== 'string') return item;
    try { return JSON.parse(item); } catch { return item; }
  });
}, z.array(mediaItemSchema).max(MAX_MEDIA).optional().default([]));

const createSchema = z.object({
  text: textSchema,
  category: categorySchema.optional().default('general'),
  poll: optionalPoll,
  media: optionalMedia,
  imageUrl: z.string().trim().max(2000).optional(),
  videoUrl: z.string().trim().max(2000).optional(),
  videoDuration: z.coerce.number().int().min(1).max(14400).optional(),
});

interface FeedMediaItem {
  type: 'image' | 'video';
  url: string;
  duration: number | null;
}


const emojiSchema = z.enum(['❤️', '🔥', '👏', '😂', '💡', '✨']);

interface PostRow {
  id: string;
  author_id: string;
  category: Category;
  text: string;
  image_url: string | null;
  video_url: string | null;
  video_duration: number | string | null;
  media: unknown;
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

/** Старі пости мають порожній media — підстраховуємоlegacy-колонками. */
function mediaFrom(raw: unknown, row?: Pick<PostRow, 'image_url' | 'video_url' | 'video_duration'>): FeedMediaItem[] {
  const items: FeedMediaItem[] = [];
  if (Array.isArray(raw)) {
    for (const value of raw) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const item = value as Record<string, unknown>;
      if ((item.type !== 'image' && item.type !== 'video') || typeof item.url !== 'string' || !item.url) continue;
      items.push({
        type: item.type,
        url: item.url,
        duration: item.duration == null ? null : Number(item.duration),
      });
    }
  }
  if (items.length === 0 && row) {
    if (row.image_url) items.push({ type: 'image', url: String(row.image_url), duration: null });
    if (row.video_url) items.push({ type: 'video', url: String(row.video_url), duration: row.video_duration == null ? null : Number(row.video_duration) });
  }
  return items;
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

  const [reactionRows, commentRows, voteRows, savedRows] = await Promise.all([
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
    query<{ post_id: string }>(
      'SELECT post_id FROM feed_saved_posts WHERE user_id = $2 AND post_id = ANY($1::uuid[])',
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
  const saved = new Set(savedRows.rows.map((row) => String(row.post_id)));

  return rows.map((row) => {
    const authorId = String(row.author_id);
    const media = mediaFrom(row.media, row);
    const firstImage = media.find((item) => item.type === 'image');
    const firstVideo = media.find((item) => item.type === 'video');
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
      media,
      imageUrl: firstImage?.url ?? (row.image_url == null ? null : String(row.image_url)),
      videoUrl: firstVideo?.url ?? (row.video_url == null ? null : String(row.video_url)),
      videoDuration: firstVideo?.duration ?? (row.video_duration == null ? null : Number(row.video_duration)),
      poll: pollFrom(row.poll, votes, String(row.id)),
      reactions: reactions.get(String(row.id)) ?? [],
      commentCount: comments.get(String(row.id)) ?? 0,
      saved: saved.has(String(row.id)),
      createdAt: iso(row.created_at),
    };
  });
}

const POST_SELECT = `
  SELECT p.id, p.author_id, p.category, p.text, p.image_url, p.video_url, p.video_duration, p.media, p.poll, p.created_at,
         u.username, u.display_name, u.avatar_url, u.role, u.is_verified, u.cosmetics
  FROM feed_posts p
  JOIN users u ON u.id = p.author_id`;

async function loadPost(id: string, viewerId: string) {
  const found = await query<PostRow>(`${POST_SELECT} WHERE p.id = $1::uuid`, [id]);
  if (!found.rows[0]) throw notFound('Пост не знайдено');
  return (await serializePosts([found.rows[0]!], viewerId))[0]!;
}

async function loadFeed(
  userId: string,
  category: Category | null,
  before: string | null,
  limit: number,
  savedOnly = false,
) {
  const result = await query<PostRow>(
    `${POST_SELECT}
     WHERE ($2::text IS NULL OR p.category = $2)
       AND ($2::text IS NOT NULL OR p.category <> 'longs')
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
       AND (
         $6::boolean = false
         OR EXISTS (
           SELECT 1 FROM feed_saved_posts s
           WHERE s.post_id = p.id AND s.user_id = $1::uuid
         )
       )
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT $5`,
    [userId, category, before, category === 'subscriptions', limit, savedOnly],
  );
  return serializePosts(result.rows, userId);
}

function parseMediaUrl(value: string | undefined, code: 'INVALID_IMAGE' | 'INVALID_VIDEO'): string | null {
  if (!value) return null;
  if (/^\/uploads\/[A-Za-z0-9._-]+$/.test(value) || /^https:\/\//i.test(value)) return value;
  throw new AppError(400, code, 'Некоректне посилання на медіа');
}

/**
 * Підпис для прямого завантаження відео з браузера.
 * Cloudinary — шматками, S3-сумісне сховище (R2/B2) — одним PUT до 2 ГБ.
 */
router.post('/upload/sign', asyncHandler(async (req, res) => {
  const input = z.object({
    bytes: z.number().int().positive().max(2 * 1024 * 1024 * 1024),
    fileName: z.string().trim().max(255).optional().default('video.mp4'),
  }).parse(req.body);

  res.json(await signFeedVideoUpload(input.bytes, input.fileName));
}));

router.get('/', asyncHandler(async (req, res) => {
  const userId = req.auth!.userId;
  const category = req.query.category === undefined
    ? null
    : categorySchema.parse(String(req.query.category));
  const before = req.query.before ? String(req.query.before) : null;
  const limit = Math.min(40, Math.max(1, Number(req.query.limit) || 20));
  const savedOnly = req.query.saved === '1';
  const posts = await loadFeed(userId, category, before, limit, savedOnly);
  res.json({ posts, hasMore: posts.length === limit });
}));

/** Свіжі пости для плаваючої кнопки, якщо сокет був недоступний. */
router.get('/since', asyncHandler(async (req, res) => {
  const after = z.string().min(1).parse(String(req.query.after ?? ''));
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM feed_posts
     WHERE author_id <> $1 AND created_at > $2::timestamptz AND category <> 'longs'`,
    [req.auth!.userId, after],
  );
  res.json({ count: Number(result.rows[0]?.count ?? 0) });
}));

router.post('/', feedUpload.fields([
  { name: 'mediaFile', maxCount: MAX_MEDIA },
  { name: 'image', maxCount: 1 },
  { name: 'video', maxCount: 1 },
]), asyncHandler(async (req, res) => {
  const userId = req.auth!.userId;
  const files = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
  const allFiles = [...(files.mediaFile ?? []), ...(files.image ?? []), ...(files.video ?? [])];
  const cleanupFiles = async () => {
    const { removeUpload } = await import('../middleware/uploads');
    for (const file of allFiles) await removeUpload(file.filename);
  };

  let input: z.infer<typeof createSchema>;
  try {
    input = createSchema.parse({
      ...req.body,
      imageUrl: files.image?.length ? undefined : req.body?.imageUrl,
      videoUrl: files.video?.length ? undefined : req.body?.videoUrl,
    });
  } catch (error) {
    await cleanupFiles();
    throw error;
  }

  try {
    const items: Array<FeedMediaItem & { file?: Express.Multer.File; duration: number | null }> = [];

    const addFile = (file: Express.Multer.File, forced?: 'image' | 'video') => {
      const mime = file.mimetype.split(';', 1)[0]!.trim().toLowerCase();
      const type = forced ?? (mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : null);
      if (!type) throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'В пості можна використовувати лише фото й відео');
      items.push({ type, url: '', duration: null, file });
    };
    for (const file of files.mediaFile ?? []) addFile(file);
    for (const file of files.image ?? []) addFile(file, 'image');
    for (const file of files.video ?? []) addFile(file, 'video');

    for (const item of input.media) {
      items.push({
        type: item.type,
        url: parseMediaUrl(item.url, item.type === 'image' ? 'INVALID_IMAGE' : 'INVALID_VIDEO') ?? '',
        duration: item.duration ?? null,
      });
    }
    const legacyImage = parseMediaUrl(input.imageUrl, 'INVALID_IMAGE');
    if (legacyImage && !items.some((item) => item.type === 'image' && item.url === legacyImage)) {
      items.push({ type: 'image', url: legacyImage, duration: null });
    }
    const legacyVideo = parseMediaUrl(input.videoUrl, 'INVALID_VIDEO');
    if (legacyVideo && !items.some((item) => item.type === 'video' && item.url === legacyVideo)) {
      items.push({ type: 'video', url: legacyVideo, duration: input.videoDuration ?? null });
    }

    if (items.length > MAX_MEDIA) throw new AppError(400, 'TOO_MANY_MEDIA', `Можна додати не більше ${MAX_MEDIA} фото й відео`);
    for (const item of items) {
      if (!item.file) continue;
      item.url = await uploadFile(item.file.buffer, item.file.originalname, item.file.mimetype);
    }

    if (!input.text.trim() && items.length === 0 && !input.poll) {
      throw new AppError(400, 'EMPTY_POST', 'Додайте текст, зображення, відео або опитування');
    }

    const videos = items.filter((item) => item.type === 'video');
    const longestVideo = videos.reduce((max, item) => Math.max(max, item.duration ?? 0), 0);
    const category: Category = videos.length > 0
      ? (longestVideo > SHORT_VIDEO_MAX_SECONDS ? 'longs' : 'shorts')
      : input.category;
    const firstImage = items.find((item) => item.type === 'image');
    const firstVideo = videos[0];
    const media = items.map(({ type, url, duration }) => ({ type, url, duration }));

    const inserted = await query<{ id: string }>(
      `INSERT INTO feed_posts (author_id, category, text, image_url, video_url, video_duration, media, poll)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8) RETURNING id`,
      [
        userId,
        category,
        input.text,
        firstImage?.url ?? null,
        firstVideo?.url ?? null,
        firstVideo?.duration ?? null,
        JSON.stringify(media),
        input.poll ? JSON.stringify(input.poll) : null,
      ],
    );
    const post = await loadPost(String(inserted.rows[0]!.id), userId);
    emitFeedNew({ id: post.id, authorId: userId, category: post.category, createdAt: post.createdAt });
    res.status(201).json({ post });
  } catch (error) {
    await cleanupFiles();
    throw error;
  }
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

/** Закладки приватні: бачить тільки їх власник. Повторний виклик знімає збереження. */
router.post('/:id/save', asyncHandler(async (req, res) => {
  const postId = z.string().uuid().parse(req.params.id);
  const userId = req.auth!.userId;
  const removed = await query(
    'DELETE FROM feed_saved_posts WHERE post_id = $1::uuid AND user_id = $2',
    [postId, userId],
  );
  const saved = removed.rowCount === 0;
  if (saved) {
    await query(
      'INSERT INTO feed_saved_posts (post_id, user_id) VALUES ($1::uuid, $2) ON CONFLICT DO NOTHING',
      [postId, userId],
    );
  }
  res.json({ saved, post: await loadPost(String(postId), userId) });
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
  const found = await query<{ author_id: string; image_url: string | null; video_url: string | null; video_duration: number | string | null; media: unknown }>(
    'SELECT author_id, image_url, video_url, video_duration, media FROM feed_posts WHERE id = $1::uuid',
    [postId],
  );
  const post = found.rows[0];
  if (!post) throw notFound('Пост не знайдено');
  if (String(post.author_id) !== userId) throw forbidden('Видаляти пост може лише його автор');
  await query('DELETE FROM feed_posts WHERE id = $1::uuid', [postId]);
  const { removeUpload } = await import('../middleware/uploads');
  const assets = mediaFrom(post.media, post).map((item) => item.url);
  for (const asset of assets) {
    if (!asset) continue;
    const filename = String(asset).startsWith('/uploads/')
      ? String(asset).slice('/uploads/'.length)
      : undefined;
    if (filename && /^[A-Za-z0-9._-]+$/.test(filename)) await removeUpload(filename);
  }
  res.json({ ok: true });
}));

export default router;
