import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { CorrectionStatus } from '@ues/shared';

/**
 * A student's request to correct their name, date of birth or photograph.
 *
 * **College-owned** — carries a `collegeId`, so every read goes through `scopeFilter`.
 *
 * The requested values are stored separately from the profile and only copied across on
 * approval. Writing them straight to the profile and flagging it "unverified" would mean
 * a marksheet printed in the meantime carried an unchecked name.
 */
const correctionRequestSchema = new Schema(
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

    /** Assigned by the server from an atomic counter, like a form number. */
    ticketNumber: { type: String, required: true, unique: true },

    /**
     * Only the fields being changed are stored. An absent key means "leave this alone",
     * which is distinct from an empty string meaning "clear it" — a middle name can
     * legitimately be removed.
     */
    requested: {
      firstName: { type: String, default: undefined, trim: true, maxlength: 60 },
      middleName: { type: String, default: undefined, trim: true, maxlength: 60 },
      lastName: { type: String, default: undefined, trim: true, maxlength: 60 },
      dateOfBirth: { type: Date, default: undefined },
      photoUrl: { type: String, default: undefined },
    },

    /**
     * A snapshot of the values at the time of the request.
     *
     * Kept so the ticket still reads correctly years later. Looking the current values up
     * at display time would show what the record says *now*, which after approval is the
     * new value — making every approved ticket look like it changed nothing.
     */
    previous: {
      firstName: { type: String, default: undefined },
      middleName: { type: String, default: undefined },
      lastName: { type: String, default: undefined },
      dateOfBirth: { type: Date, default: undefined },
      photoUrl: { type: String, default: undefined },
    },

    status: {
      type: String,
      enum: Object.values(CorrectionStatus),
      default: CorrectionStatus.Pending,
      index: true,
    },

    /** Required when declined; enforced in the service and the request schema. */
    reason: { type: String, default: null, maxlength: 500 },

    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

/** Serves the clerk's queue: this college's pending tickets, oldest first. */
correctionRequestSchema.index({ collegeId: 1, status: 1, createdAt: 1 });

/**
 * At most one pending ticket per student.
 *
 * A partial index, so it constrains only pending rows — a student may have any number of
 * resolved tickets in their history, but cannot have two open at once asking for
 * conflicting changes.
 *
 * The explicit `name` is required. Mongo derives an index name from its keys, so this
 * would otherwise be called `studentId_1` — the same name as the plain index created by
 * `index: true` on the field above — and creating the second fails with a name conflict.
 * Both indexes are wanted: the plain one serves a student's ticket history, the partial
 * one enforces the single-open-ticket rule.
 */
correctionRequestSchema.index(
  { studentId: 1 },
  {
    name: 'one_pending_ticket_per_student',
    unique: true,
    partialFilterExpression: { status: CorrectionStatus.Pending },
  },
);

export type CorrectionRequest = InferSchemaType<typeof correctionRequestSchema>;
export type CorrectionRequestDocument = HydratedDocument<CorrectionRequest>;

export const CorrectionRequestModel = model('CorrectionRequest', correctionRequestSchema);
