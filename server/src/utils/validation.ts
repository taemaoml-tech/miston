import { z } from 'zod';

export const uuid = z.string().uuid();
export const messageId = z.coerce.bigint().positive();
export const pagination = {
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
};

export const password = z.string()
  .min(8)
  .max(128)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, {
    message: 'Пароль не має перевищувати 72 байти UTF-8',
  });
