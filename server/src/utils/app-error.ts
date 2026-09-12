import { ApiErrorCode } from '@ues/shared';

/**
 * An error the API deliberately raises and knows how to present to a client.
 *
 * Anything thrown that is not an `AppError` is treated as a bug by the error handler:
 * it is logged in full and reported to the caller as a generic 500, so internal detail
 * never leaks out in a response body.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details: Record<string, string[]> | undefined;
  /** Distinguishes a handled domain error from an unexpected crash. */
  readonly isOperational = true;

  constructor(
    statusCode: number,
    code: ApiErrorCode,
    message: string,
    details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message: string, details?: Record<string, string[]>): AppError {
    return new AppError(400, ApiErrorCode.BadRequest, message, details);
  }

  static validation(message: string, details: Record<string, string[]>): AppError {
    return new AppError(422, ApiErrorCode.ValidationFailed, message, details);
  }

  static unauthenticated(message = 'Authentication is required.'): AppError {
    return new AppError(401, ApiErrorCode.Unauthenticated, message);
  }

  static tokenExpired(message = 'Your session has expired.'): AppError {
    return new AppError(401, ApiErrorCode.TokenExpired, message);
  }

  static forbidden(message = 'You do not have permission to do that.'): AppError {
    return new AppError(403, ApiErrorCode.Forbidden, message);
  }

  /**
   * Used for genuinely absent records *and* for records belonging to another college.
   * Returning 404 rather than 403 for a cross-tenant read is intentional: a 403 would
   * confirm that the id exists somewhere, which is itself a leak across tenants.
   */
  static notFound(message = 'Not found.'): AppError {
    return new AppError(404, ApiErrorCode.NotFound, message);
  }

  static conflict(message: string, details?: Record<string, string[]>): AppError {
    return new AppError(409, ApiErrorCode.Conflict, message, details);
  }
}
