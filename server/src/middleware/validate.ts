import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

/**
 * Parses and replaces one part of the request with its validated result.
 *
 * The replacement matters: after this runs, `req.body` is the *parsed* value, so it is
 * trimmed, coerced, and stripped of any field the schema does not declare. A handler
 * therefore cannot act on an attacker-supplied extra property, which is the mass-
 * assignment problem that `[Bind(Include=...)]` guards against in ASP.NET MVC.
 *
 * A ZodError thrown here is caught by the central error handler and rendered as a 422
 * with per-field messages, so no route needs its own try/catch.
 */
export function validateBody(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    req.body = schema.parse(req.body);
    next();
  };
}

export function validateParams(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    Object.assign(req.params, schema.parse(req.params));
    next();
  };
}

export function validateQuery(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    // Express 5 exposes `req.query` through a getter with no setter, so it is mutated
    // in place rather than reassigned as in Express 4.
    Object.assign(req.query, schema.parse(req.query));
    next();
  };
}
