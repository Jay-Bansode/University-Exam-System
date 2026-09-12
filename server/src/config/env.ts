import { z } from 'zod';

/**
 * Environment configuration, validated once at startup.
 *
 * Reading `process.env` directly at the point of use means a missing variable surfaces
 * as an undefined-shaped bug on some later request. Parsing the whole environment here
 * means the process refuses to start instead, with a message naming every missing key.
 * This is the same instinct as failing fast on a bad connection string at app start.
 */

/**
 * Parses `"a,b,c"` into `['a', 'b', 'c']` and requires each entry to be a valid URL.
 *
 * The default is written as an array rather than a string because in Zod 4 `.default()`
 * takes the schema's *output* type and skips the pipeline. (`.prefault()` is the
 * variant that takes the input type and runs the transform; an array is clearer here.)
 */
const CommaSeparatedOrigins = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.url()));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),

  MONGODB_URI: z
    .string()
    .min(1, 'MONGODB_URI is required — get it from your MongoDB Atlas cluster'),

  /**
   * Exact origins allowed to call this API with credentials. A wildcard is impossible
   * here: browsers reject `Access-Control-Allow-Origin: *` on credentialed requests,
   * and the refresh-token cookie makes every auth request credentialed.
   */
  CORS_ORIGINS: CommaSeparatedOrigins.default(['http://localhost:5173']),

  /**
   * Signing key for access tokens.
   *
   * A 32-character minimum is enforced because an HS256 signature is only as strong as
   * this string: a short secret is brute-forceable offline, letting an attacker mint
   * tokens for any role, including university admin.
   *
   *   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   */
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),

  /** Access-token lifetime in minutes. Short by design; the refresh cookie renews it. */
  ACCESS_TOKEN_MINUTES: z.coerce.number().int().positive().max(60).default(15),

  /** Refresh-token lifetime in days — how long "stay signed in" actually lasts. */
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().max(90).default(7),

  /** Password given to every seeded demo account. Never used for real accounts. */
  SEED_DEMO_PASSWORD: z.string().min(8).default('Demo@12345'),

  /**
   * Cloudinary, for student photographs. All three are optional together.
   *
   * Optional because the rest of the correction workflow — name and date-of-birth
   * changes — must work without an image host configured. When these are absent the
   * photo option is disabled and the API says so, rather than failing at upload time
   * with something cryptic.
   *
   * The API secret signs upload requests and must never reach the browser.
   */
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    // Thrown rather than logged so the process exits non-zero and the host reports a
    // failed deploy, instead of serving a broken instance.
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
