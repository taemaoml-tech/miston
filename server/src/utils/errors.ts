export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function unauthorized(message = 'Потрібна автентифікація'): AppError {
  return new AppError(401, 'UNAUTHORIZED', message);
}

export function forbidden(message = 'Недостатньо прав'): AppError {
  return new AppError(403, 'FORBIDDEN', message);
}

export function notFound(message = 'Ресурс не знайдено'): AppError {
  return new AppError(404, 'NOT_FOUND', message);
}
