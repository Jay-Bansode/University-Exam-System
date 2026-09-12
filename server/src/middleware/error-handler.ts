import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { ApiErrorCode } from '@ues/shared';
import { AppError } from '../utils/app-error.js';
import { sendFailure } from '../utils/respond.js';
import { isProduction } from '../config/env.js';

/**
 * Catch-all for unmatched routes. Registered after every real route, so reaching it
 * means no route matched.
 */
export const notFoundHandler: RequestHandler = (req, res) => {
  sendFailure(
    res,
    404,
    ApiErrorCode.NotFound,
    `No route matches ${req.method} ${req.originalUrl}`,
  );
};

/** Flattens a Zod error into `{ fieldPath: [messages] }`. */
function zodDetails(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    (details[key] ??= []).push(issue.message);
  }
  return details;
}

/**
 * The single place an error becomes a response.
 *
 * Express 5 forwards rejected promises from async handlers here automatically, so
 * routes do not need a try/catch or an `asyncHandler` wrapper — that wrapper was an
 * Express 4 workaround and is deliberately absent.
 *
 * The four-parameter signature is what marks this as error middleware to Express. The
 * unused `next` cannot be removed, which is why it is prefixed with an underscore.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof AppError) {
    sendFailure(res, error.statusCode, error.code, error.message, error.details);
    return;
  }

  if (error instanceof ZodError) {
    sendFailure(
      res,
      422,
      ApiErrorCode.ValidationFailed,
      'The submitted data is not valid.',
      zodDetails(error),
    );
    return;
  }

  // A malformed ObjectId in the URL is a client mistake, not a server fault.
  if (error instanceof mongoose.Error.CastError) {
    sendFailure(res, 400, ApiErrorCode.BadRequest, `Invalid value for '${error.path}'.`);
    return;
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const details: Record<string, string[]> = {};
    for (const [path, issue] of Object.entries(error.errors)) {
      details[path] = [issue.message];
    }
    sendFailure(
      res,
      422,
      ApiErrorCode.ValidationFailed,
      'The submitted data is not valid.',
      details,
    );
    return;
  }

  // Duplicate key against a unique index.
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 11000
  ) {
    const keyPattern =
      (error as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};
    const fields = Object.keys(keyPattern);
    sendFailure(
      res,
      409,
      ApiErrorCode.Conflict,
      fields.length
        ? `A record with that ${fields.join(' and ')} already exists.`
        : 'That record already exists.',
    );
    return;
  }

  // Anything reaching here is unplanned. Log it fully; tell the client nothing.
  console.error(`[error] unhandled on ${req.method} ${req.originalUrl}`, error);

  sendFailure(
    res,
    500,
    ApiErrorCode.Internal,
    isProduction
      ? 'Something went wrong. Please try again.'
      : error instanceof Error
        ? error.message
        : 'Unknown error',
  );
};
