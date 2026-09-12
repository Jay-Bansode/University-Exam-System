import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { ACADEMIC_YEAR_PATTERN, ExamFormStatus } from '@ues/shared';

/**
 * A student's registration for one semester's examinations.
 *
 * **College-owned** — carries a `collegeId`, so every read goes through `scopeFilter`.
 *
 * The schema is defined here in Phase 5, ahead of the student screens in Phase 6, for
 * the same reason `SemesterOffering` was defined in Phase 3: faculty must not be able to
 * withdraw a subject that a student has already registered for, and without this model
 * that guard would count zero every time and silently allow it.
 */

// The status values live in `@ues/shared` so the client can render them without a
// second copy that could drift from the one the database enforces.

const examFormSchema = new Schema(
  {
    collegeId: {
      type: Schema.Types.ObjectId,
      ref: 'College',
      required: true,
      index: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    offeringId: {
      type: Schema.Types.ObjectId,
      ref: 'SemesterOffering',
      required: true,
    },

    /**
     * Denormalised from the offering on purpose.
     *
     * An offering describes what a college is teaching *now*; a form records what a
     * student registered for *then*. Reading these through the offering would rewrite
     * history the moment faculty edited it, so the form keeps its own copy.
     */
    streamId: { type: Schema.Types.ObjectId, ref: 'Stream', required: true },
    academicYear: {
      type: String,
      required: true,
      match: [ACADEMIC_YEAR_PATTERN, 'Use the format 2026-27'],
    },
    semester: { type: Number, required: true, min: 1, max: 8 },

    /** The subjects actually registered for — a subset of the offering's list. */
    subjectIds: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],

    status: {
      type: String,
      enum: Object.values(ExamFormStatus),
      default: ExamFormStatus.Draft,
      index: true,
    },

    /** Assigned by the server on submission, never chosen by the student. */
    formNumber: { type: String, default: null },

    submittedAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    /** Required when a clerk rejects; enforced in the Phase 7 service. */
    rejectionReason: { type: String, default: null, maxlength: 500 },
  },
  { timestamps: true },
);

/** One form per student per semester per academic year. */
examFormSchema.index({ studentId: 1, academicYear: 1, semester: 1 }, { unique: true });

/** Serves the clerk's queue: this college's forms awaiting verification. */
examFormSchema.index({ collegeId: 1, status: 1, submittedAt: 1 });

/** Lets the offering guard ask "has anyone registered for this subject?" from an index. */
examFormSchema.index({ subjectIds: 1 });

export type ExamForm = InferSchemaType<typeof examFormSchema>;
export type ExamFormDocument = HydratedDocument<ExamForm>;

export const ExamFormModel = model('ExamForm', examFormSchema);
