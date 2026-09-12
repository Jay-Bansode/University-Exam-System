import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * An affiliated college. This is the tenant.
 *
 * University-owned: a College document has no `collegeId` of its own, because it *is*
 * the thing other documents point at. Only a university admin may create or modify one.
 */
const collegeSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'College name is required'],
      trim: true,
      maxlength: 200,
    },
    /**
     * The short affiliation code a university assigns, shown on forms and marksheets.
     * Uppercased on write so `mgm` and `MGM` cannot both exist.
     */
    code: {
      type: String,
      required: [true, 'College code is required'],
      trim: true,
      uppercase: true,
      unique: true,
      match: [/^[A-Z0-9-]{2,12}$/, 'Code must be 2-12 characters: A-Z, 0-9 or hyphen'],
    },
    city: { type: String, trim: true, maxlength: 100, default: '' },
    address: { type: String, trim: true, maxlength: 300, default: '' },
    affiliationYear: {
      type: Number,
      min: 1850,
      max: 2100,
    },
    /**
     * Deactivating a college blocks every one of its users at login without deleting
     * any history. Exam records must survive an affiliation lapsing.
     */
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export type College = InferSchemaType<typeof collegeSchema>;
export type CollegeDocument = HydratedDocument<College>;

export const CollegeModel = model('College', collegeSchema);
