import { z } from 'zod';
import { ACADEMIC_YEAR_PATTERN, ProgramType, SubjectType } from '@ues/shared';

/** Request schemas for the syllabus and exam-window routes. */

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

export const objectIdParamSchema = z.object({ id: objectId });

/* ------------------------------------------------------------------ streams */

export const createStreamSchema = z.object({
  name: z.string().trim().min(3, 'Name must be at least 3 characters').max(120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,10}$/, 'Use 2-10 characters: A-Z or 0-9'),
  programType: z.enum([ProgramType.BE, ProgramType.Diploma]),
});

export const updateStreamSchema = createStreamSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

/* ----------------------------------------------------------------- subjects */

/**
 * The upper bound is 8 because that is the longest programme. Whether a *particular*
 * stream has that many semesters depends on its programme type, and the service checks
 * it against the stream — a rule this schema cannot see from the request alone.
 */
const semester = z.coerce
  .number()
  .int()
  .min(1, 'Semester must be at least 1')
  .max(8, 'Semester cannot exceed 8');

export const createSubjectSchema = z.object({
  streamId: objectId,
  semester,
  name: z.string().trim().min(3, 'Name must be at least 3 characters').max(150),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,15}$/, 'Use 2-15 characters: A-Z, 0-9 or hyphen'),
  credits: z.coerce.number().min(0).max(20),
  subjectType: z.enum([SubjectType.Theory, SubjectType.Practical, SubjectType.Elective]),
});

export const updateSubjectSchema = createSubjectSchema
  .omit({ streamId: true })
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

export const listSubjectsQuerySchema = z.object({
  streamId: objectId.optional(),
  semester: semester.optional(),
});

/* ------------------------------------------------------------ exam windows */

const academicYear = z
  .string()
  .trim()
  .regex(ACADEMIC_YEAR_PATTERN, 'Use the format 2026-27');

/** ISO 8601, which is what `<input type="datetime-local">` plus `toISOString` produces. */
const isoDate = z.string().datetime({ offset: true }).or(z.iso.datetime());

export const createExamWindowSchema = z
  .object({
    academicYear,
    semester,
    openAt: isoDate,
    closeAt: isoDate,
    isPublished: z.boolean().optional(),
  })
  // Checked here as well as in the model so the client gets a field-level 422 rather
  // than a generic validation failure from Mongoose.
  .refine((value) => new Date(value.closeAt) > new Date(value.openAt), {
    message: 'The closing date must be after the opening date',
    path: ['closeAt'],
  });

export const updateExamWindowSchema = z
  .object({
    academicYear: academicYear.optional(),
    semester: semester.optional(),
    openAt: isoDate.optional(),
    closeAt: isoDate.optional(),
    isPublished: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  })
  .refine(
    (value) =>
      !value.openAt || !value.closeAt || new Date(value.closeAt) > new Date(value.openAt),
    { message: 'The closing date must be after the opening date', path: ['closeAt'] },
  );
