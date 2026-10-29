import { query } from '../db/pool';
import type { UserRole } from '../types/domain';

export interface AccountRow {
  id: string;
  role: UserRole;
  is_verified: boolean;
  is_blocked: boolean;
  blocked_until: Date | null;
  blocked_reason: string;
}

const SELECT = `
  SELECT id,
         role,
         is_verified,
         (blocked_at IS NOT NULL AND (blocked_until IS NULL OR blocked_until > now())) AS is_blocked,
         CASE WHEN blocked_at IS NOT NULL AND (blocked_until IS NULL OR blocked_until > now())
              THEN blocked_until ELSE NULL END AS blocked_until,
         CASE WHEN blocked_at IS NOT NULL AND (blocked_until IS NULL OR blocked_until > now())
              THEN blocked_reason ELSE '' END AS blocked_reason
  FROM users
  WHERE id = $1`;

export async function loadAccount(userId: string): Promise<AccountRow | null> {
  const result = await query<AccountRow>(SELECT, [userId]);
  return result.rows[0] ?? null;
}

export function blockMessage(row: AccountRow): string {
  const reason = row.blocked_reason ? `. Причина: ${row.blocked_reason}` : '';
  const until = row.blocked_until ? ` до ${row.blocked_until.toISOString().slice(0, 16)} UTC` : '';
  return `Акаунт заблоковано${until}${reason}`;
}
