import { z } from 'zod';

/**
 * Request schemas for the auth routes.
 *
 * These sit at the HTTP boundary and are the only place untrusted input becomes typed
 * data — the same role DataAnnotations plus model binding play in ASP.NET MVC, except
 * the TypeScript type is derived from the schema rather than declared alongside it.
 */

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Email is required')
    .pipe(z.email('Enter a valid email address')),
  /**
   * Only presence is checked, never a strength rule. A login form must accept whatever
   * the account already has; strength belongs on the routes that *set* a password.
   * The upper bound guards bcrypt, which silently ignores input past 72 bytes.
   */
  password: z.string().min(1, 'Password is required').max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Password rules for account creation, used from Phase 2 onward.
 * Length does more for strength than character-class rules, hence the 10-character floor.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(72, 'Passwords are limited to 72 characters')
  .refine((value) => /[a-z]/.test(value), 'Include a lowercase letter')
  .refine((value) => /[A-Z]/.test(value), 'Include an uppercase letter')
  .refine((value) => /[0-9]/.test(value), 'Include a digit');
