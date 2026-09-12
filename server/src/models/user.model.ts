import {
  Schema,
  model,
  type HydratedDocument,
  type InferSchemaType,
  type Types,
} from 'mongoose';
import { ALL_ROLES, EntryType, ProgramType, Role } from '@ues/shared';

/**
 * Every human in the system, in one collection with a `role` discriminator.
 *
 * One collection rather than five: authentication is identical for all roles, so five
 * collections would mean five lookups on every login just to find out who is signing
 * in. The role-specific fields are few enough to carry in an optional sub-document.
 *
 * Tenancy: `collegeId` is required for the four college-scoped roles and must be null
 * for a university admin. That rule is enforced in a pre-validate hook below rather
 * than left to callers, because it is the invariant the whole isolation model rests on.
 */

const studentProfileSchema = new Schema(
  {
    rollNumber: { type: String, trim: true, uppercase: true, maxlength: 30 },
    programType: { type: String, enum: Object.values(ProgramType) },
    entryType: {
      type: String,
      enum: Object.values(EntryType),
      default: EntryType.Regular,
    },
    currentSemester: { type: Number, min: 1, max: 8 },
    streamId: { type: Schema.Types.ObjectId, ref: 'Stream', default: null },
    dateOfBirth: { type: Date },
    /** Cloudinary URL. Never a local path: Render's filesystem does not persist. */
    photoUrl: { type: String, default: null },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      unique: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address'],
    },
    /**
     * `select: false` keeps the hash out of every query result by default, so it can
     * only leave the database when a caller asks for it explicitly. That turns
     * "remember to strip the password" from a discipline problem into a default.
     */
    passwordHash: { type: String, required: true, select: false },

    firstName: { type: String, required: true, trim: true, maxlength: 60 },
    middleName: { type: String, trim: true, maxlength: 60, default: null },
    lastName: { type: String, required: true, trim: true, maxlength: 60 },

    role: { type: String, enum: ALL_ROLES, required: true, index: true },

    collegeId: {
      type: Schema.Types.ObjectId,
      ref: 'College',
      default: null,
      index: true,
    },

    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },

    /**
     * Marks a seeded account whose credentials are published on the login page so a
     * recruiter can explore without being given a password. The demo endpoint filters
     * on this flag, so a real account can never be listed there by accident.
     */
    isDemo: { type: Boolean, default: false, index: true },

    studentProfile: { type: studentProfileSchema, default: null },
  },
  { timestamps: true },
);

export type User = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<User>;
export type UserId = Types.ObjectId;

/**
 * The tenancy invariant, enforced at the schema level.
 *
 * A college-scoped user without a college would be invisible to every scoped query, and
 * a university admin *with* one would be silently confined to a single tenant. Both are
 * data-integrity failures that would be painful to diagnose later, so neither is allowed
 * to be written in the first place.
 *
 * Two Mongoose 9 details here. The `<UserDocument>` generic is explicit because Mongoose
 * cannot infer the hydrated document type from a schema declared without generics.
 * And a pre-hook no longer receives a `next` callback: it returns void or a promise, and
 * failure is signalled by throwing. Calling `next(err)` was the Mongoose 8 style and no
 * longer type-checks.
 */
userSchema.pre<UserDocument>('validate', function () {
  const isUniversityAdmin = this.role === Role.UniversityAdmin;

  if (isUniversityAdmin && this.collegeId !== null && this.collegeId !== undefined) {
    throw new Error('A university admin must not belong to a college');
  }

  if (!isUniversityAdmin && !this.collegeId) {
    throw new Error(`Role '${this.role}' requires a collegeId`);
  }

  if (this.role !== Role.Student && this.studentProfile) {
    throw new Error('Only a student may have a studentProfile');
  }
});

/**
 * Supports the clerk and admin student search, which matches on name within one college.
 * The `collegeId` field leads the index so a scoped search can seek straight to the
 * tenant's slice instead of scanning names across every college.
 */
userSchema.index({ collegeId: 1, role: 1, lastName: 1, firstName: 1 });

/** Roll numbers repeat across colleges, so uniqueness is per college, not global. */
userSchema.index(
  { collegeId: 1, 'studentProfile.rollNumber': 1 },
  {
    unique: true,
    partialFilterExpression: { 'studentProfile.rollNumber': { $type: 'string' } },
  },
);

// No `fullName` virtual: `Model.create()` does not return a type carrying virtuals, so
// declaring one forced every caller to compute the name by hand regardless. It is a
// property of the response, not the document — see `utils/names.ts`.

export const UserModel = model('User', userSchema);
