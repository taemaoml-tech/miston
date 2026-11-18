import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/http';
import { AppError } from '../utils/errors';

const router = Router();

router.use(requireAuth);

interface FolderRow {
  id: string;
  name: string;
  color: string;
  created_at: Date | string;
}

const nameSchema = z.string().trim().min(1).max(60);
const colorSchema = z.string().trim().regex(/^[a-z]{3,20}$/).max(20);

async function assertFolderOwner(folderId: string, userId: string): Promise<void> {
  const result = await query<{ id: string }>('SELECT id FROM chat_folders WHERE id = $1 AND user_id = $2', [folderId, userId]);
  if (!result.rows[0]) throw new AppError(404, 'FOLDER_NOT_FOUND', 'Папку не знайдено.');
}

async function assertConversationMember(conversationId: string, userId: string): Promise<void> {
  const result = await query<{ conversation_id: string }>(
    'SELECT conversation_id FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId],
  );
  if (!result.rows[0]) throw new AppError(403, 'NOT_CONVERSATION_MEMBER', 'Цей чат вам недоступний.');
}

async function assertNameFree(userId: string, name: string, exceptId?: string): Promise<void> {
  const result = await query<{ id: string }>(
    'SELECT id FROM chat_folders WHERE user_id = $1 AND name = $2 AND id IS DISTINCT FROM $3',
    [userId, name, exceptId ?? null],
  );
  if (result.rows[0]) throw new AppError(409, 'FOLDER_EXISTS', 'Папка з такою назвою вже існує.');
}

async function loadFolders(userId: string) {
  const [folders, items] = await Promise.all([
    query<FolderRow>(
      'SELECT id, name, color, created_at FROM chat_folders WHERE user_id = $1 ORDER BY created_at ASC',
      [userId],
    ),
    query<{ folder_id: string; conversation_id: string }>(
      'SELECT folder_id, conversation_id FROM chat_folder_items WHERE user_id = $1',
      [userId],
    ),
  ]);
  const byFolder = new Map<string, string[]>();
  for (const item of items.rows) {
    const list = byFolder.get(item.folder_id) ?? [];
    list.push(item.conversation_id);
    byFolder.set(item.folder_id, list);
  }
  return folders.rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    color: row.color,
    conversationIds: byFolder.get(String(row.id)) ?? [],
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

router.get('/', asyncHandler(async (req, res) => {
  res.json({ folders: await loadFolders(req.auth!.userId) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, color } = z.object({
    name: nameSchema,
    color: colorSchema.optional().default('blue'),
  }).parse(req.body);
  await assertNameFree(req.auth!.userId, name);
  const inserted = await query<FolderRow>(
    'INSERT INTO chat_folders (user_id, name, color) VALUES ($1, $2, $3) RETURNING id, name, color, created_at',
    [req.auth!.userId, name, color],
  );
  const row = inserted.rows[0];
  if (!row) throw new AppError(500, 'FOLDER_CREATE_FAILED', 'Не вдалося створити папку.');
  res.status(201).json({
    folder: { id: String(row.id), name: row.name, color: row.color, conversationIds: [], createdAt: new Date(row.created_at).toISOString() },
  });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const { name, color } = z.object({
    name: nameSchema.optional(),
    color: colorSchema.optional(),
  }).parse(req.body);
  if (name === undefined && color === undefined) throw new AppError(400, 'NO_CHANGES', 'Немає змін для збереження.');
  await assertFolderOwner(String(req.params.id), req.auth!.userId);
  if (name !== undefined) await assertNameFree(req.auth!.userId, name, String(req.params.id));
  const updated = await query<FolderRow>(
    `UPDATE chat_folders
     SET name = COALESCE($3, name), color = COALESCE($4, color), updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING id, name, color, created_at`,
    [String(req.params.id), req.auth!.userId, name ?? null, color ?? null],
  );
  const row = updated.rows[0];
  if (!row) throw new AppError(404, 'FOLDER_NOT_FOUND', 'Папку не знайдено.');
  res.json({ folder: { id: String(row.id), name: row.name, color: row.color, conversationIds: [], createdAt: new Date(row.created_at).toISOString() } });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await query('DELETE FROM chat_folders WHERE id = $1 AND user_id = $2', [String(req.params.id), req.auth!.userId]);
  if ((result.rowCount ?? 0) === 0) throw new AppError(404, 'FOLDER_NOT_FOUND', 'Папку не знайдено.');
  res.json({ ok: true });
}));

router.post('/:id/conversations', asyncHandler(async (req, res) => {
  const { conversationId } = z.object({ conversationId: z.string().min(1).max(64) }).parse(req.body);
  await assertFolderOwner(String(req.params.id), req.auth!.userId);
  await assertConversationMember(conversationId, req.auth!.userId);
  await query(
    `INSERT INTO chat_folder_items (folder_id, user_id, conversation_id)
     VALUES ($1, $2, $3) ON CONFLICT (folder_id, conversation_id) DO NOTHING`,
    [String(req.params.id), req.auth!.userId, conversationId],
  );
  res.json({ ok: true });
}));

router.delete('/:id/conversations/:conversationId', asyncHandler(async (req, res) => {
  await assertFolderOwner(String(req.params.id), req.auth!.userId);
  await query(
    'DELETE FROM chat_folder_items WHERE folder_id = $1 AND user_id = $2 AND conversation_id = $3',
    [String(req.params.id), req.auth!.userId, String(req.params.conversationId)],
  );
  res.json({ ok: true });
}));

router.put('/:id/conversations', asyncHandler(async (req, res) => {
  const { conversationIds } = z.object({ conversationIds: z.array(z.string().min(1).max(64)).max(500) }).parse(req.body);
  await assertFolderOwner(String(req.params.id), req.auth!.userId);
  for (const conversationId of conversationIds) await assertConversationMember(conversationId, req.auth!.userId);
  await withFolderTransaction(String(req.params.id), req.auth!.userId, conversationIds);
  res.json({ ok: true });
}));

async function withFolderTransaction(folderId: string, userId: string, conversationIds: string[]): Promise<void> {
  await withTransaction(async (client) => {
    await client.query('DELETE FROM chat_folder_items WHERE folder_id = $1 AND user_id = $2', [folderId, userId]);
    for (const conversationId of conversationIds) {
      await client.query(
        'INSERT INTO chat_folder_items (folder_id, user_id, conversation_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [folderId, userId, conversationId],
      );
    }
  });
}

export default router;
