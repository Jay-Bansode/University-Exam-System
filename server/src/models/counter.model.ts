import { Schema, model } from 'mongoose';

/**
 * Atomic sequence generator for form numbers.
 *
 * The obvious implementation — count the existing forms and add one — is a race. Two
 * students submitting at the same moment both read the same count and both get the same
 * number, and the failure only appears under the load of a registration deadline, which
 * is exactly when it must not.
 *
 * `findOneAndUpdate` with `$inc` and `upsert` is a single atomic document operation in
 * MongoDB, so two concurrent callers are serialised by the database and receive
 * different values. No transaction and no application-level lock is needed.
 */
const counterSchema = new Schema({
  /** Scope of the sequence, e.g. `form:MGMCET:2026-27:5`. */
  _id: { type: String, required: true },
  value: { type: Number, default: 0 },
});

const CounterModel = model('Counter', counterSchema);

/** Returns the next value in the named sequence, starting at 1. */
export async function nextSequence(key: string): Promise<number> {
  const counter = await CounterModel.findOneAndUpdate(
    { _id: key },
    { $inc: { value: 1 } },
    // `returnDocument: 'after'` gives the incremented value rather than the
    // pre-increment one. (This replaces the older `new: true`, which Mongoose 9
    // deprecates.) `upsert` creates the counter on first use, so nothing has to seed it.
    { returnDocument: 'after', upsert: true },
  );

  return counter.value;
}

export { CounterModel };
