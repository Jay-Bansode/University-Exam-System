/**
 * The single response envelope every API route returns.
 *
 * A fixed shape means the client has exactly one thing to unwrap and one place to look
 * for errors, instead of guessing per endpoint. `code` is a stable machine-readable
 * string; `message` is for humans and may change freely.
 */

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiFailure = {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    /** Field-level problems, keyed by the field path Zod reported. */
    details?: Record<string, string[]>;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const ApiErrorCode = {
  BadRequest: 'BAD_REQUEST',
  ValidationFailed: 'VALIDATION_FAILED',
  Unauthenticated: 'UNAUTHENTICATED',
  TokenExpired: 'TOKEN_EXPIRED',
  Forbidden: 'FORBIDDEN',
  NotFound: 'NOT_FOUND',
  Conflict: 'CONFLICT',
  RateLimited: 'RATE_LIMITED',
  Internal: 'INTERNAL',
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

/** Payload of GET /api/health. */
export type HealthResponse = {
  status: 'ok';
  service: string;
  version: string;
  environment: string;
  /** Mongo connection state, so a green health check really means the database is up. */
  database: 'connected' | 'connecting' | 'disconnected';
  timestamp: string;
  /** Seconds since the process started. Near zero means Render just cold-started. */
  uptimeSeconds: number;
};
