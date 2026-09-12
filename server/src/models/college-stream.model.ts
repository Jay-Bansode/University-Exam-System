import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * A university stream that one college has chosen to offer.
 *
 * **College-owned**: it carries a `collegeId`, so every read goes through `scopeFilter`.
 *
 * This is a join rather than a copy. The stream's name, code, and semester count stay in
 * the university's `Stream` document, and this record only says "this college teaches
 * that". Copying the fields here would let a college's idea of a stream drift from the
 * university's, which is precisely what an affiliated university exists to prevent.
 */
const collegeStreamSchema = new Schema(
  {
    collegeId: {
      type: Schema.Types.ObjectId,
      ref: 'College',
      required: [true, 'A college stream must belong to a college'],
      index: true,
    },
    streamId: {
      type: Schema.Types.ObjectId,
      ref: 'Stream',
      required: [true, 'A stream is required'],
    },
  },
  { timestamps: true },
);

/** A college offers a given stream once. */
collegeStreamSchema.index({ collegeId: 1, streamId: 1 }, { unique: true });

export type CollegeStream = InferSchemaType<typeof collegeStreamSchema>;
export type CollegeStreamDocument = HydratedDocument<CollegeStream>;

export const CollegeStreamModel = model('CollegeStream', collegeStreamSchema);
