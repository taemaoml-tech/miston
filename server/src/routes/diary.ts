import { randomInt } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/http';
import { AppError, forbidden, notFound } from '../utils/errors';
import { uuid } from '../utils/validation';

const router = Router();
router.use(requireAuth);

interface ClassRow {
  id: string;
  name: string;
  grade: string | null;
  invite_code: string | null;
  role: string;
  data: Record<string, unknown> | null;
  updated_at: Date | string;
}

interface ClassMemberRow {
  class_id: string;
  id: string;
  display_name: string;
  username: string;
}

interface NoteRow {
  id: string;
  date: string;
  title: string;
  body: string;
  done: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

const INVITE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const INVITE_CODE_LENGTH = 8;
const MAX_STATE_BYTES = 500_000;

function createDefaultState(): Record<string, unknown> {
  return { subjects: [], lessons: [], grades: [], attendance: [], students: [] };
}

function normalizeState(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return createDefaultState();
  return value as Record<string, unknown>;
}

function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    code += INVITE_ALPHABET.charAt(randomInt(INVITE_ALPHABET.length));
  }
  return code;
}

function toIso(value: Date | string): string {
  return new Date(value).toISOString();
}

const classBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  grade: z.string().trim().max(40).optional(),
});

const joinSchema = z.object({
  code: z.string().trim().min(1).max(64).transform((value) => value.toUpperCase()),
});

const stateSchema = z.custom<Record<string, unknown>>(
  (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null),
  { message: 'Очікується JSON-об\'єкт' },
).refine((value) => Buffer.byteLength(JSON.stringify(value), 'utf8') <= MAX_STATE_BYTES, {
  message: 'Стан класу надто великий',
});

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Очікується коректна дата YYYY-MM-DD');

const noteBodySchema = z.object({
  date: dateString,
  title: z.string().max(200),
  body: z.string().max(10000),
  done: z.boolean().optional(),
});

const notePatchSchema = noteBodySchema.partial();

const diaryRoleSchema = z.enum(['student', 'teacher', 'parent']);
const roleBodySchema = z.object({
  role: diaryRoleSchema,
  childId: uuid.nullable().optional(),
});
const homeworkSchema = z.object({
  lessonId: z.string().trim().min(1).max(200),
  done: z.boolean(),
});

function serializeNote(row: NoteRow | undefined) {
  if (!row) throw notFound('Нотатку не знайдено');
  return {
    id: String(row.id),
    date: String(row.date),
    title: String(row.title),
    body: String(row.body),
    done: Boolean(row.done),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

async function loadClassSummaries(userId: string, classId?: string) {
  const values: unknown[] = [userId];
  const filter = classId === undefined ? '' : 'AND c.id = $2';
  if (classId !== undefined) values.push(classId);

  const classes = await query<ClassRow>(
    `SELECT c.id, c.name, c.grade,
            CASE WHEN m.role = 'teacher' OR c.owner_id = m.user_id THEN c.invite_code ELSE NULL END AS invite_code,
            m.role,
            COALESCE(s.data, '{}'::jsonb) AS data,
            COALESCE(s.updated_at, c.created_at) AS updated_at
     FROM diary_class_members m
     JOIN diary_classes c ON c.id = m.class_id
     LEFT JOIN diary_state s ON s.class_id = c.id
     WHERE m.user_id = $1 ${filter}
     ORDER BY c.name ASC, c.id ASC`,
    values,
  );
  if (classes.rows.length === 0) return [];

  const members = await query<ClassMemberRow>(
    `SELECT cm.class_id, u.id, u.display_name, u.username
     FROM diary_class_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.class_id = ANY($1::uuid[])
     ORDER BY u.display_name ASC, u.username ASC`,
    [classes.rows.map((row) => String(row.id))],
  );
  const membersByClass = new Map<string, ClassMemberRow[]>();
  for (const member of members.rows) {
    const list = membersByClass.get(String(member.class_id)) ?? [];
    list.push(member);
    membersByClass.set(String(member.class_id), list);
  }

  return classes.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    grade: row.grade === null ? null : String(row.grade),
    inviteCode: row.invite_code === null ? null : String(row.invite_code),
    role: String(row.role),
    members: (membersByClass.get(String(row.id)) ?? []).map((member) => ({
      id: String(member.id),
      displayName: String(member.display_name),
      username: String(member.username),
    })),
    state: row.data ?? createDefaultState(),
    updatedAt: toIso(row.updated_at),
  }));
}

async function requireClassSummary(classId: string, userId: string) {
  const summaries = await loadClassSummaries(userId, classId);
  const summary = summaries[0];
  if (!summary) throw notFound('Клас не знайдено');
  return summary;
}

async function loadDiaryRole(userId: string) {
  const result = await query<{ role: string; child_id: string | null }>(
    'SELECT role, child_id FROM diary_roles WHERE user_id = $1',
    [userId],
  );
  const row = result.rows[0];
  return {
    role: row ? String(row.role) : null,
    childId: row?.child_id ? String(row.child_id) : null,
  };
}

router.get('/me', asyncHandler(async (req, res) => {
  res.json(await loadDiaryRole(req.auth!.userId));
}));

router.put('/me/role', asyncHandler(async (req, res) => {
  const input = roleBodySchema.parse(req.body);
  const childId = input.role === 'parent' ? (input.childId ?? null) : null;
  await query(
    `INSERT INTO diary_roles (user_id, role, child_id) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, child_id = EXCLUDED.child_id, updated_at = now()`,
    [req.auth!.userId, input.role, childId],
  );
  res.json({ role: input.role, childId });
}));

router.get('/classes', asyncHandler(async (req, res) => {
  res.json({ classes: await loadClassSummaries(req.auth!.userId) });
}));

router.post('/classes', asyncHandler(async (req, res) => {
  const input = classBodySchema.parse(req.body);
  const userId = req.auth!.userId;

  const classId = await withTransaction(async (client) => {
    let code = generateInviteCode();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const taken = await client.query('SELECT 1 FROM diary_classes WHERE invite_code = $1', [code]);
      if ((taken.rowCount ?? 0) === 0) break;
      code = generateInviteCode();
    }

    const inserted = await client.query<{ id: string }>(
      'INSERT INTO diary_classes (name, grade, invite_code, owner_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [input.name, input.grade ?? null, code, userId],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new AppError(500, 'CLASS_CREATE_FAILED', 'Не вдалося створити клас');

    await client.query(
      "INSERT INTO diary_class_members (class_id, user_id, role) VALUES ($1, $2, 'teacher')",
      [id, userId],
    );
    await client.query(
      'INSERT INTO diary_state (class_id, data) VALUES ($1, $2::jsonb)',
      [id, JSON.stringify(createDefaultState())],
    );
    return String(id);
  });

  res.status(201).json(await requireClassSummary(classId, userId));
}));

router.post('/classes/join', asyncHandler(async (req, res) => {
  const { code } = joinSchema.parse(req.body);
  const userId = req.auth!.userId;

  const found = await query<{ id: string }>('SELECT id FROM diary_classes WHERE invite_code = $1', [code]);
  const classRow = found.rows[0];
  if (!classRow) throw notFound('Клас за цим кодом не знайдено');

  await query(
    `INSERT INTO diary_class_members (class_id, user_id, role)
     VALUES ($1, $2, 'student') ON CONFLICT (class_id, user_id) DO NOTHING`,
    [classRow.id, userId],
  );
  res.json(await requireClassSummary(String(classRow.id), userId));
}));

router.put('/classes/:id/state', asyncHandler(async (req, res) => {
  const classId = uuid.parse(req.params.id);
  const { state } = z.object({ state: stateSchema }).parse(req.body);
  const userId = req.auth!.userId;

  const access = await query<{ role: string | null }>(
    `SELECT m.role
     FROM diary_classes c
     LEFT JOIN diary_class_members m ON m.class_id = c.id AND m.user_id = $2
     WHERE c.id = $1`,
    [classId, userId],
  );
  const membership = access.rows[0];
  if (!membership) throw notFound('Клас не знайдено');
  if (membership.role !== 'teacher') throw forbidden('Змінювати стан класу можуть лише викладачі');

  const updated = await query<{ updated_at: Date | string }>(
    `INSERT INTO diary_state (class_id, data, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (class_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
     RETURNING updated_at`,
    [classId, JSON.stringify(state)],
  );
  const updatedAt = updated.rows[0]?.updated_at;
  if (!updatedAt) throw new AppError(500, 'STATE_SAVE_FAILED', 'Не вдалося зберегти стан класу');

  res.json({ ok: true, updatedAt: toIso(updatedAt) });
}));

/**
 * Учні можуть позначати домашнє завдання виконаним, не маючи права
 * змінювати решту стану класу. Батьки — лише спостерігачі.
 */
router.patch('/classes/:id/homework', asyncHandler(async (req, res) => {
  const classId = uuid.parse(req.params.id);
  const { lessonId, done } = homeworkSchema.parse(req.body);
  const userId = req.auth!.userId;

  const access = await query<{ class_role: string | null; diary_role: string | null }>(
    `SELECT m.role AS class_role, dr.role AS diary_role
     FROM diary_classes c
     LEFT JOIN diary_class_members m ON m.class_id = c.id AND m.user_id = $2
     LEFT JOIN diary_roles dr ON dr.user_id = $2
     WHERE c.id = $1`,
    [classId, userId],
  );
  const accessRow = access.rows[0];
  if (!accessRow) throw notFound('Клас не знайдено');
  if (!accessRow.class_role) throw forbidden('Ви не є учасником цього класу');
  if (accessRow.diary_role === 'parent') throw forbidden('Батьки не позначають домашні завдання');

  const stored = await query<{ data: Record<string, unknown> }>(
    'SELECT data FROM diary_state WHERE class_id = $1',
    [classId],
  );
  const data = normalizeState(stored.rows[0]?.data);
  const lessons = Array.isArray(data.lessons) ? data.lessons.slice() : [];
  const index = lessons.findIndex((lesson) => lesson
    && typeof lesson === 'object'
    && String((lesson as Record<string, unknown>).id) === lessonId);
  if (index < 0) throw notFound('Урок не знайдено');

  const lesson = lessons[index] as Record<string, unknown>;
  const homework = lesson.homework && typeof lesson.homework === 'object' && !Array.isArray(lesson.homework)
    ? lesson.homework as Record<string, unknown>
    : {};
  lessons[index] = { ...lesson, homework: { ...homework, done } };
  const state = { ...data, lessons };

  const updated = await query<{ updated_at: Date | string }>(
    `INSERT INTO diary_state (class_id, data, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (class_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
     RETURNING updated_at`,
    [classId, JSON.stringify(state)],
  );
  res.json({ ok: true, updatedAt: toIso(updated.rows[0]!.updated_at), state });
}));

router.get('/notes', asyncHandler(async (req, res) => {
  const { from, to } = z.object({
    from: dateString.optional(),
    to: dateString.optional(),
  }).parse(req.query);

  const values: unknown[] = [req.auth!.userId];
  const conditions = ['user_id = $1'];
  if (from !== undefined) {
    values.push(from);
    conditions.push(`note_date >= $${values.length}`);
  }
  if (to !== undefined) {
    values.push(to);
    conditions.push(`note_date <= $${values.length}`);
  }

  const result = await query<NoteRow>(
    `SELECT id, to_char(note_date, 'YYYY-MM-DD') AS date, title, body, done, created_at, updated_at
     FROM diary_notes
     WHERE ${conditions.join(' AND ')}
     ORDER BY note_date DESC, created_at DESC`,
    values,
  );
  res.json({ notes: result.rows.map(serializeNote) });
}));

router.post('/notes', asyncHandler(async (req, res) => {
  const input = noteBodySchema.parse(req.body);
  const result = await query<NoteRow>(
    `INSERT INTO diary_notes (user_id, note_date, title, body, done)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, to_char(note_date, 'YYYY-MM-DD') AS date, title, body, done, created_at, updated_at`,
    [req.auth!.userId, input.date, input.title, input.body, input.done ?? false],
  );
  res.status(201).json({ note: serializeNote(result.rows[0]) });
}));

router.patch('/notes/:id', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const input = notePatchSchema.parse(req.body);
  const userId = req.auth!.userId;
  const values: unknown[] = [id, userId];
  const sets: string[] = [];

  if (input.date !== undefined) {
    values.push(input.date);
    sets.push(`note_date = $${values.length}`);
  }
  if (input.title !== undefined) {
    values.push(input.title);
    sets.push(`title = $${values.length}`);
  }
  if (input.body !== undefined) {
    values.push(input.body);
    sets.push(`body = $${values.length}`);
  }
  if (input.done !== undefined) {
    values.push(input.done);
    sets.push(`done = $${values.length}`);
  }

  let result;
  if (sets.length === 0) {
    result = await query<NoteRow>(
      `SELECT id, to_char(note_date, 'YYYY-MM-DD') AS date, title, body, done, created_at, updated_at
       FROM diary_notes WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
  } else {
    sets.push('updated_at = now()');
    result = await query<NoteRow>(
      `UPDATE diary_notes
       SET ${sets.join(', ')}
       WHERE id = $1 AND user_id = $2
       RETURNING id, to_char(note_date, 'YYYY-MM-DD') AS date, title, body, done, created_at, updated_at`,
      values,
    );
  }
  res.json({ note: serializeNote(result.rows[0]) });
}));

router.delete('/notes/:id', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const result = await query('DELETE FROM diary_notes WHERE id = $1 AND user_id = $2', [id, req.auth!.userId]);
  if ((result.rowCount ?? 0) === 0) throw notFound('Нотатку не знайдено');
  res.json({ ok: true });
}));

export default router;
