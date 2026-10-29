import { Router } from 'express';
import { z } from 'zod';
import { ROLE_LABELS, hasCapability, requirePermission, type AdminCapability } from '../auth/permissions';
import { query } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { removeUpload } from '../middleware/uploads';
import { listComplaints, updateComplaintStatus } from '../moderation/complaints';
import { listSupportRequests, supportQuerySchema, updateSupportStatus } from '../moderation/support';
import { listSentNotifications, sendSystemNotification } from '../moderation/notifications';
import {
  adjustStars, blockUser, createStaffAccount, deleteAccount, deleteMessageByStaff,
  getPlatformStats, listAuditLogs, listModerationUsers, setStaffRole, setVerification, unblockUser,
} from '../moderation/service';
import { emitMessageDeleted, emitSystemNotification, forceUserLogout, notifyUserRefresh } from '../sockets/emitter';
import { asyncHandler } from '../utils/http';
import { password, uuid } from '../utils/validation';
import type { ModerationUser } from '../types/domain';

const router = Router();
router.use(requireAuth);

const CAPABILITIES: AdminCapability[] = [
  'panel.open', 'user.view', 'user.block', 'user.delete', 'user.verify', 'star.manage',
  'staff.manage', 'stats.view', 'audit.view', 'notification.send', 'complaint.view',
  'complaint.manage', 'message.delete',
];

const idParams = z.object({ id: uuid });
const messageIdParams = z.object({ id: z.coerce.bigint().positive() });
const emptyToUndefined = (value: unknown): unknown => (value === '' || value == null ? undefined : value);

const userListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(['user', 'moderator', 'owner']).optional(),
  status: z.enum(['all', 'online', 'blocked', 'verified']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

const blockBody = z.object({
  reason: z.string().trim().max(300).default(''),
  untilHours: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(8_760).optional()),
});
const verificationBody = z.object({ verified: z.boolean() });
const starBody = z.object({
  direction: z.enum(['grant', 'remove']),
  amount: z.coerce.number().int().min(1).max(1_000_000),
  description: z.string().trim().max(200).default(''),
});
const roleBody = z.object({ role: z.enum(['user', 'moderator']) });
const staffBody = z.object({
  email: z.string().trim().email().max(254),
  username: z.string().trim().regex(/^[A-Za-z0-9_]{3,30}$/),
  displayName: z.string().trim().min(1).max(80),
  password,
});
const auditQuery = z.object({
  action: z.enum([
    'user.block', 'user.unblock', 'user.delete', 'user.verify', 'user.unverify',
    'star.grant', 'star.remove', 'role.grant', 'role.revoke',
    'complaint.status', 'message.delete', 'notification.send', 'support.status',
  ]).optional(),
  userId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
const notificationBody = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().max(1000).default(''),
});
const complaintQuery = z.object({
  status: z.enum(['new', 'in_progress', 'closed']).optional(),
  category: z.enum(['spam', 'harassment', 'nsfw', 'scam', 'copyright', 'other']).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
const complaintBody = z.object({
  status: z.enum(['new', 'in_progress', 'closed']),
  resolution: z.string().trim().max(500).default(''),
});

/** Пошту бачить лише власник: модератору достатньо імені, балансу й статусу. */
function projectUsers(users: ModerationUser[], includeEmail: boolean): ModerationUser[] {
  return includeEmail ? users : users.map((user) => ({ ...user, email: '' }));
}

router.get('/overview', requirePermission('panel.open'), asyncHandler(async (req, res) => {
  const role = req.auth!.role;
  res.json({
    role,
    roleLabel: ROLE_LABELS[role],
    capabilities: CAPABILITIES.filter((capability) => hasCapability(role, capability)),
    stats: await getPlatformStats(),
  });
}));

router.get('/stats', requirePermission('stats.view'), asyncHandler(async (_req, res) => {
  res.json(await getPlatformStats());
}));

router.get('/users', requirePermission('user.view'), asyncHandler(async (req, res) => {
  const filters = userListQuery.parse(req.query);
  const result = await listModerationUsers(filters);
  res.json({
    users: projectUsers(result.users, req.auth!.role === 'owner'),
    total: result.total,
    limit: filters.limit,
    offset: filters.offset,
  });
}));

router.post('/users/:id/block', requirePermission('user.block'), asyncHandler(async (req, res) => {
  const { id } = idParams.parse(req.params);
  const user = await blockUser(req.auth!, id, blockBody.parse(req.body));
  await forceUserLogout(id, 'account:blocked');
  res.json({ user });
}));

router.post('/users/:id/unblock', requirePermission('user.block'), asyncHandler(async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ user: await unblockUser(req.auth!, id) });
}));

router.delete('/users/:id', requirePermission('user.delete'), asyncHandler(async (req, res) => {
  const { id } = idParams.parse(req.params);
  await forceUserLogout(id, 'account:deleted');
  const account = await deleteAccount(req.auth!, id);
  res.json({ removed: true, account });
}));

router.put('/users/:id/verification', requirePermission('user.verify'), asyncHandler(async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { verified } = verificationBody.parse(req.body);
  const user = await setVerification(req.auth!, id, verified);
  notifyUserRefresh(id);
  res.json({ user });
}));

router.post('/users/:id/star', requirePermission('star.manage'), asyncHandler(async (req, res) => {
  const { id } = idParams.parse(req.params);
  const input = starBody.parse(req.body);
  const amount = input.direction === 'grant' ? input.amount : -input.amount;
  const description = input.description
    || (input.direction === 'grant' ? 'Нарахування від адміністрації' : 'Списання адміністрацією');
  const reward = await adjustStars(req.auth!, id, amount, description);
  notifyUserRefresh(id);
  res.json({ reward });
}));

router.get('/users/:id/star-history', requirePermission('star.manage'), asyncHandler(async (req, res) => {
  const { id } = idParams.parse(req.params);
  const [transactions, wallet] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT t.id, t.amount, t.reason, t.description, t.balance_after, t.created_at,
              a.display_name AS actor_name, a.role AS actor_role
       FROM star_transactions t
       LEFT JOIN users a ON a.id = (NULLIF(t.meta->>'actorId', ''))::uuid
       WHERE t.user_id = $1
       ORDER BY t.id DESC LIMIT 40`,
      [id],
    ),
    query<{ balance: number }>('SELECT balance FROM user_wallets WHERE user_id = $1', [id]),
  ]);
  res.json({
    balance: Number(wallet.rows[0]?.balance ?? 0),
    items: transactions.rows.map((row) => ({
      id: String(row.id),
      amount: Number(row.amount),
      reason: String(row.reason),
      description: String(row.description ?? ''),
      balanceAfter: Number(row.balance_after),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      actorName: row.actor_name == null ? null : String(row.actor_name),
      actorRole: row.actor_role == null ? null : String(row.actor_role),
    })),
  });
}));

router.put('/users/:id/role', requirePermission('staff.manage'), asyncHandler(async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { role } = roleBody.parse(req.body);
  const user = await setStaffRole(req.auth!, id, role);
  notifyUserRefresh(id);
  res.json({ user });
}));

router.post('/staff', requirePermission('staff.manage'), asyncHandler(async (req, res) => {
  res.status(201).json({ user: await createStaffAccount(req.auth!, staffBody.parse(req.body)) });
}));

router.get('/audit', requirePermission('audit.view'), asyncHandler(async (req, res) => {
  const filters = auditQuery.parse(req.query);
  const result = await listAuditLogs(filters);
  res.json({ ...result, limit: filters.limit, offset: filters.offset });
}));

router.post('/notifications', requirePermission('notification.send'), asyncHandler(async (req, res) => {
  const notification = await sendSystemNotification(req.auth!, notificationBody.parse(req.body));
  emitSystemNotification(notification);
  res.status(201).json({ notification });
}));

router.get('/notifications', requirePermission('panel.open'), asyncHandler(async (req, res) => {
  const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(req.query);
  res.json({ items: await listSentNotifications(limit) });
}));

router.get('/complaints', requirePermission('complaint.view'), asyncHandler(async (req, res) => {
  const filters = complaintQuery.parse(req.query);
  const result = await listComplaints(filters);
  res.json({ ...result, limit: filters.limit, offset: filters.offset });
}));

router.patch('/complaints/:id', requirePermission('complaint.manage'), asyncHandler(async (req, res) => {
  const { id } = idParams.parse(req.params);
  const input = complaintBody.parse(req.body);
  res.json({ complaint: await updateComplaintStatus(req.auth!, id, input.status, input.resolution) });
}));

const supportIdParams = z.object({ id: z.coerce.bigint().positive() });

router.get('/support', requirePermission('complaint.view'), asyncHandler(async (req, res) => {
  const filters = supportQuerySchema.parse(req.query);
  const result = await listSupportRequests(filters);
  res.json({ ...result, limit: filters.limit, offset: filters.offset });
}));

router.patch('/support/:id', requirePermission('complaint.manage'), asyncHandler(async (req, res) => {
  const { id } = supportIdParams.parse(req.params);
  const input = complaintBody.parse(req.body);
  res.json({ request: await updateSupportStatus(req.auth!, id.toString(), input.status, input.resolution) });
}));

router.delete('/messages/:id', requirePermission('message.delete'), asyncHandler(async (req, res) => {
  const { id } = messageIdParams.parse(req.params);
  const messageId = id.toString();
  const result = await deleteMessageByStaff(req.auth!, messageId);
  await Promise.all(result.filenames.map((filename) => removeUpload(filename)));
  emitMessageDeleted(result.conversationId, messageId);
  res.json({ messageId, conversationId: result.conversationId });
}));

export default router;
