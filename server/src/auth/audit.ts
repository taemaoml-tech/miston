import type { PoolClient } from 'pg';
import { query } from '../db/pool';
import type { AdminAction, AuthContext } from '../types/domain';

export interface AuditInput {
  action: AdminAction;
  actor: AuthContext;
  targetUserId?: string | null;
  targetId?: string;
  details?: Record<string, unknown>;
}

const INSERT = `INSERT INTO admin_action_logs (actor_id, actor_role, action, target_user_id, target_id, details)
                VALUES ($1, $2::user_role, $3, $4, $5, $6::jsonb)`;

function params(input: AuditInput): unknown[] {
  return [
    input.actor.userId,
    input.actor.role,
    input.action,
    input.targetUserId ?? null,
    input.targetId ?? '',
    JSON.stringify(input.details ?? {}),
  ];
}

/** Журнал пишеться в тій самій транзакції, що й дія, щоб не лишати «дія без запису». */
export async function recordAudit(client: PoolClient, input: AuditInput): Promise<void> {
  await client.query(INSERT, params(input));
}

export async function recordAuditStandalone(input: AuditInput): Promise<void> {
  await query(INSERT, params(input));
}
