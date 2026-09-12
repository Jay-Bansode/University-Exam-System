import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { ACADEMIC_YEAR_PATTERN } from '@ues/shared';

/**
 * The subjects one college is actually running for one stream and semester.
 *
 * **College-owned** — it carries a `collegeId` and every read of it must go through
 * `scopeFilter`. This is the join that makes the permission model work: faculty compose
 * an offering by picking from the university's `Subject` catalogue, so they choose what
 * their college teaches without ever being able to invent a subject.
 *
 * The schema is defined here in Phase 3, ahead of the faculty screens in Phase 5,
 * because subject deletion must refuse to orphan an offering. Without the model the
 * guard would silently count zero and always allow the delete.
 */
const semesterOfferingSchema = new Schema(
  {
    collegeId: {
      type: Schema.Types.ObjectId,
      ref: 'College',
      required: [true, 'An offering must belong to a college'],
      index: true,
    },
    streamId: {
      type: Schema.Types.ObjectId,
      ref: 'Stream',
      required: true,
    },
    academicYear: {
      type: String,
      required: true,
      trim: true,
      match: [ACADEMIC_YEAR_PATTERN, 'Use the format 2026-27'],
    },
    semester: { type: Number, required: true, min: 1, max: 8 },

    /** References into the university's master syllabus. Never inline copies. */
    subjectIds: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

/** One offering per college, stream, semester, and year. */
semesterOfferingSchema.index(
  { collegeId: 1, streamId: 1, academicYear: 1, semester: 1 },
  { unique: true },
);

/** Lets the subject-deletion guard ask "is any offering using this?" from an index. */
semesterOfferingSchema.index({ subjectIds: 1 });

export type SemesterOffering = InferSchemaType<typeof semesterOfferingSchema>;
export type SemesterOfferingDocument = HydratedDocument<SemesterOffering>;

export const SemesterOfferingModel = model('SemesterOffering', semesterOfferingSchema);
