import { z } from 'zod';
import { ACADEMIC_YEAR_PATTERN } from '@ues/shared';

/** Request schemas for semester offerings. */

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

export const objectIdParamSchema = z.object({ id: objectId });

const semester = z.coerce.number().int().min(1).max(8);

const academicYear = z
  .string()
  .trim()
  .regex(ACADEMIC_YEAR_PATTERN, 'Use the format 2026-27');

export const saveOfferingSchema = z.object({
  streamId: objectId,
  academicYear,
  semester,
  /**
   * Capped at 20. A semester of a Mumbai University engineering programme runs to about
   * eight or nine subjects including laboratories, so anything approaching this is a
   * mistake — and an unbounded array is an easy way to make the server do unnecessary
   * work.
   */
  subjectIds: z.array(objectId).min(1, 'Select at least one subject').max(20),
});

export const listOfferingsQuerySchema = z.object({
  streamId: objectId.optional(),
  semester: semester.optional(),
  academicYear: academicYear.optional(),
});

export const offerableSubjectsQuerySchema = z.object({
  streamId: objectId,
  semester,
});
