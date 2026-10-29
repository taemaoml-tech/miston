import type { RequestHandler } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { forbidden, notFound, unauthorized } from '../utils/errors';
import { uuid } from '../utils/validation';

const conversationParams = z.object({ id: uuid });
const serverParams = z.object({ id: uuid });

export const requireConversationMembership: RequestHandler = async (req, _res, next) => {
  try {
    if (!req.auth) throw unauthorized();
    const { id } = conversationParams.parse(req.params);
    const result = await query<{ is_member: boolean }>(
      `SELECT c.id, (cm.user_id IS NOT NULL) AS is_member
       FROM conversations c
       LEFT JOIN conversation_members cm
         ON cm.conversation_id = c.id AND cm.user_id = $2
       WHERE c.id = $1`,
      [id, req.auth.userId],
    );
    if (result.rowCount === 0) throw notFound('Розмову не знайдено');
    if (!result.rows[0]?.is_member) throw forbidden('Ви не є учасником цієї розмови');
    next();
  } catch (error) {
    next(error);
  }
};

export const requireServerManager: RequestHandler = async (req, _res, next) => {
  try {
    if (!req.auth) throw unauthorized();
    const { id } = serverParams.parse(req.params);
    const result = await query<{ role: string }>(
      `SELECT sm.role FROM servers s
       LEFT JOIN server_members sm
         ON sm.server_id = s.id AND sm.user_id = $2
       WHERE s.id = $1`,
      [id, req.auth.userId],
    );
    if (result.rowCount === 0) throw notFound('Сервер не знайдено');
    const role = result.rows[0]?.role;
    if (role !== 'owner' && role !== 'admin') {
      throw forbidden('Потрібні права власника або адміністратора сервера');
    }
    next();
  } catch (error) {
    next(error);
  }
};
