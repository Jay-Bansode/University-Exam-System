import { z } from 'zod';

/**
 * Request schemas for college management.
 *
 * The rules match the Mongoose schema on purpose. Zod rejects bad input at the boundary
 * with a helpful per-field 422, while the database constraint remains the last line of
 * defence for anything that reaches it another way. Two layers, deliberately.
 */

const currentYear = new Date().getFullYear();

export const createCollegeSchema = z.object({
  name: z.string().trim().min(3, 'Name must be at least 3 characters').max(200),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,12}$/, 'Use 2-12 characters: A-Z, 0-9 or hyphen'),
  city: z.string().trim().max(100).optional(),
  address: z.string().trim().max(300).optional(),
  affiliationYear: z.coerce
    .number()
    .int()
    .min(1850, 'That year seems too early')
    // Allows next year, since an affiliation can be granted ahead of the intake.
    .max(currentYear + 1, 'That year is in the future')
    .optional(),
});

/**
 * Every field optional for a PATCH, but at least one must be present — an empty body is
 * a mistake, and silently returning the unchanged record would hide it.
 */
export const updateCollegeSchema = createCollegeSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

export const collegeStatusSchema = z.object({
  isActive: z.boolean(),
});

export const createCollegeAdminSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  firstName: z.string().trim().min(1, 'First name is required').max(60),
  middleName: z.string().trim().max(60).optional(),
  lastName: z.string().trim().min(1, 'Last name is required').max(60),
});

export const objectIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id'),
});
