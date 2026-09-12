import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { buildCorsOptions } from './config/cors.js';
import { isProduction } from './config/env.js';
// Imported for the side effect of registering every model before any route can run a
// populate(). Without it, registration order depends on which endpoint is hit first.
import './models/index.js';
import apiRoutes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

/**
 * Builds the Express application without starting a server.
 *
 * Keeping `listen` out of this file is what makes the API testable: Supertest can drive
 * the app object directly, with no port to bind and no cleanup between test files.
 */
export function createApp(): Express {
  const app = express();

  // Render terminates TLS at its proxy and forwards over plain HTTP. Without this,
  // Express sees an insecure request and refuses to set `secure` cookies, which breaks
  // the refresh token in production while working perfectly on localhost.
  if (isProduction) {
    app.set('trust proxy', 1);
  }

  // Removes the default `X-Powered-By: Express` header, which advertises the stack
  // to no benefit.
  app.disable('x-powered-by');

  /**
   * Security headers. `crossOriginResourcePolicy` is relaxed because this API is called
   * from a different origin (Vercel) than the one it is served from (Render); helmet's
   * `same-origin` default would block those responses outright.
   *
   * The Content-Security-Policy default is switched off here: this process serves JSON
   * only, never HTML, so a CSP protects nothing and only risks confusing errors. The
   * client's CSP is Vercel's concern.
   */
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(cors(buildCorsOptions()));

  // Parses the refresh-token cookie. Must run before any route that reads `req.cookies`.
  app.use(cookieParser());

  // A body-size cap. The default is 100kb; this is explicit so the limit is a decision
  // rather than an accident. Images never travel through here — they go to Cloudinary.
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  app.use('/api', apiRoutes);

  // Order matters: the 404 handler must sit after every route, and the error handler
  // must be registered last of all, or Express will not route errors to it.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
