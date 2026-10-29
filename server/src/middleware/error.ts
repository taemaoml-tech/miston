import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';
import { config } from '../config/env';

interface DatabaseError extends Error {
  code?: string;
  constraint?: string;
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', 'Кінцеву точку не знайдено'));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Сталася непередбачувана помилка';
  let details: unknown;

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Некоректні дані запиту';
    details = error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
  } else if (error instanceof MulterError) {
    statusCode = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR';
    message = error.code === 'LIMIT_FILE_SIZE' ? 'Файл перевищує дозволений розмір' : error.message;
  } else if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Некоректний JSON у тілі запиту';
  } else if ((error as DatabaseError)?.code === '23505') {
    statusCode = 409;
    code = 'CONFLICT';
    message = 'Ресурс із такими унікальними значеннями вже існує';
  } else if ((error as DatabaseError)?.code === '23503') {
    statusCode = 400;
    code = 'INVALID_REFERENCE';
    message = 'Пов\'язаний ресурс не існує';
  }

  if (statusCode >= 500) {
    console.error('Request failed', error);
  }

  res.status(statusCode).json({
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
      ...(config.NODE_ENV === 'development' && statusCode >= 500 ? { stack: (error as Error).stack } : {}),
    },
  });
};
