import type { Response } from 'express';
import type { ApiErrorCode, ApiFailure, ApiSuccess } from '@ues/shared';

/**
 * The only two ways a route may write a body. Routing every response through these
 * keeps the envelope identical everywhere, so the client never special-cases a route.
 */

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): Response {
  const body: ApiSuccess<T> = { success: true, data };
  return res.status(statusCode).json(body);
}

export function sendFailure(
  res: Response,
  statusCode: number,
  code: ApiErrorCode,
  message: string,
  details?: Record<string, string[]>,
): Response {
  const body: ApiFailure = {
    success: false,
    error: details ? { code, message, details } : { code, message },
  };
  return res.status(statusCode).json(body);
}
