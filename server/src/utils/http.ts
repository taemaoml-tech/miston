import type { RequestHandler } from 'express';

export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export const uuidSchemaMessage = 'Очікується коректний UUID';
