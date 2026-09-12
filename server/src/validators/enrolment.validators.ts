import { z } from 'zod';
import { EntryType, Role } from '@ues/shared';

/** Request schemas for college-level people and programme management. */

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

export const objectIdParamSchema = z.object({ id: objectId });

export const addCollegeStreamSchema = z.object({
  streamId: objectId,
});

const name = (label: string) => z.string().trim().min(1, `${label} is required`).max(60);

const studentEnrolmentSchema = z.object({
  rollNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,30}$/, 'Use 2-30 characters: A-Z, 0-9 or hyphen'),
  streamId: objectId,
  entryType: z.enum([EntryType.Regular, EntryType.Lateral]),
  /**
   * Bounded at 8 here because that is the longest programme. Whether a given semester is
   * valid depends on the stream's programme *and* the entry type — a lateral-entry
   * student starts at 3 — so the real check happens in the service, which can see both.
   */
  currentSemester: z.coerce.number().int().min(1).max(8),
  dateOfBirth: z.iso.date().optional(),
});

/**
 * A college admin may create faculty, clerks and students only.
 *
 * `collegeAdmin` and `universityAdmin` are absent from the enum on purpose: a tenant must
 * not be able to expand its own administration, and only the university creates college
 * admins. An attempt to send either is rejected as a validation error before any handler
 * runs.
 */
export const createUserSchema = z
  .object({
    role: z.enum([Role.Faculty, Role.Clerk, Role.Student]),
    email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
    firstName: name('First name'),
    middleName: z.string().trim().max(60).optional(),
    lastName: name('Last name'),
    student: studentEnrolmentSchema.optional(),
  })
  .refine((value) => value.role !== Role.Student || value.student !== undefined, {
    message: 'Enrolment details are required for a student',
    path: ['student'],
  })
  .refine((value) => value.role === Role.Student || value.student === undefined, {
    message: 'Only a student has enrolment details',
    path: ['student'],
  });

export const updateUserSchema = z
  .object({
    firstName: name('First name').optional(),
    middleName: z.string().trim().max(60).optional(),
    lastName: name('Last name').optional(),
    student: studentEnrolmentSchema.partial().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

export const userStatusSchema = z.object({
  isActive: z.boolean(),
});
