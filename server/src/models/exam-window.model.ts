import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { ACADEMIC_YEAR_PATTERN } from '@ues/shared';

/**
 * The period during which colleges may accept exam forms for one semester.
 *
 * University-owned, and the mechanism by which the university controls the registration
 * calendar across every affiliated college at once. A college cannot open registration
 * early or leave it open late — the check happens server-side on submission, so it is a
 * rule rather than a suggestion.
 */
const examWindowSchema = new Schema(
  {
    /** `2026-27`. Indian academic years run July to June, so the label spans two years. */
    academicYear: {
      type: String,
      required: [true, 'Academic year is required'],
      trim: true,
      match: [ACADEMIC_YEAR_PATTERN, 'Use the format 2026-27'],
    },
    semester: {
      type: Number,
      required: [true, 'Semester is required'],
      min: 1,
      max: 8,
    },
    openAt: { type: Date, required: [true, 'An opening date is required'] },
    closeAt: { type: Date, required: [true, 'A closing date is required'] },

    /**
     * Separate from the dates so a window can be drafted and reviewed before it goes
     * live. An unpublished window is never open, whatever its dates say.
     */
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true },
);

/** One window per semester per academic year. */
examWindowSchema.index({ academicYear: 1, semester: 1 }, { unique: true });

export type ExamWindow = InferSchemaType<typeof examWindowSchema>;
export type ExamWindowDocument = HydratedDocument<ExamWindow>;

examWindowSchema.pre<ExamWindowDocument>('validate', function () {
  if (this.openAt && this.closeAt && this.closeAt.getTime() <= this.openAt.getTime()) {
    throw new Error('The closing date must be after the opening date');
  }
});

/**
 * Whether the window is accepting forms right now.
 *
 * Evaluated on the server against the server's clock. Deciding this in the browser would
 * let anyone open registration by changing their system time.
 */
export function isWindowOpen(window: ExamWindow, now = new Date()): boolean {
  if (!window.isPublished) return false;
  return now >= window.openAt && now <= window.closeAt;
}

export function windowStatus(
  window: ExamWindow,
  now = new Date(),
): 'draft' | 'upcoming' | 'open' | 'closed' {
  if (!window.isPublished) return 'draft';
  if (now < window.openAt) return 'upcoming';
  if (now > window.closeAt) return 'closed';
  return 'open';
}

export const ExamWindowModel = model('ExamWindow', examWindowSchema);
