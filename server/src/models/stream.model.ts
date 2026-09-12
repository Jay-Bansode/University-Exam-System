import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { ProgramType, TOTAL_SEMESTERS } from '@ues/shared';

/**
 * An academic branch — Computer Engineering, Information Technology, Mechanical, and so
 * on — as published by the university.
 *
 * University-owned: no `collegeId`. The university defines the branch and its syllabus
 * once, and every affiliated college teaches that same definition. Which branches a
 * given college actually offers is recorded separately, in `CollegeStream` (Phase 4).
 *
 * The schema is defined here in Phase 1, ahead of the admin screens in Phase 3, because
 * `User.studentProfile.streamId` references it. An unregistered referenced model makes
 * `populate()` throw at runtime, which surfaced as a 500 on the login route.
 */
const streamSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Stream name is required'],
      trim: true,
      maxlength: 120,
    },
    /** Short code shown on forms, e.g. `CE` for Computer Engineering. */
    code: {
      type: String,
      required: [true, 'Stream code is required'],
      trim: true,
      uppercase: true,
      maxlength: 10,
    },
    programType: {
      type: String,
      enum: Object.values(ProgramType),
      required: true,
    },
    /**
     * Denormalised from `programType` (8 for a BE, 6 for a Diploma) so a query does not
     * have to know the rule. Derived on save rather than trusted from input, so the two
     * fields cannot disagree.
     */
    totalSemesters: { type: Number, min: 1, max: 8 },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

/** A code is unique per programme, since a BE and a Diploma may both have a `CE`. */
streamSchema.index({ code: 1, programType: 1 }, { unique: true });

export type Stream = InferSchemaType<typeof streamSchema>;
export type StreamDocument = HydratedDocument<Stream>;

streamSchema.pre<StreamDocument>('validate', function () {
  this.totalSemesters = TOTAL_SEMESTERS[this.programType];
});

export const StreamModel = model('Stream', streamSchema);
