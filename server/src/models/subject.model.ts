import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { SubjectType } from '@ues/shared';

/**
 * One entry in the university's master syllabus.
 *
 * University-owned: there is no `collegeId`, because the university publishes the
 * syllabus once and every affiliated college teaches that same definition. Only a
 * university admin may create or delete one; faculty select from this catalogue but can
 * never add to it. That permission boundary is also a data boundary, which is what stops
 * one college quietly inventing its own subjects.
 */
const subjectSchema = new Schema(
  {
    streamId: {
      type: Schema.Types.ObjectId,
      ref: 'Stream',
      required: [true, 'A subject must belong to a stream'],
      index: true,
    },
    semester: {
      type: Number,
      required: [true, 'Semester is required'],
      min: 1,
      max: 8,
    },
    name: {
      type: String,
      required: [true, 'Subject name is required'],
      trim: true,
      maxlength: 150,
    },
    /** The code printed on exam forms and marksheets, e.g. `CSC501`. */
    code: {
      type: String,
      required: [true, 'Subject code is required'],
      trim: true,
      uppercase: true,
      maxlength: 15,
    },
    credits: {
      type: Number,
      required: true,
      min: 0,
      max: 20,
    },
    subjectType: {
      type: String,
      enum: Object.values(SubjectType),
      default: SubjectType.Theory,
    },
    /**
     * Retiring a subject rather than deleting it. A syllabus is revised between intakes,
     * and a subject a graduating cohort already sat must stay resolvable on their
     * records long after it stops being taught.
     */
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** A code is unique within a stream. Two streams may legitimately reuse one. */
subjectSchema.index({ streamId: 1, code: 1 }, { unique: true });

/** Serves the common read: every subject for one stream and semester, in code order. */
subjectSchema.index({ streamId: 1, semester: 1, code: 1 });

export type Subject = InferSchemaType<typeof subjectSchema>;
export type SubjectDocument = HydratedDocument<Subject>;

export const SubjectModel = model('Subject', subjectSchema);
