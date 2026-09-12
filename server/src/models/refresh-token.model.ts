import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * A stored refresh token, kept so sessions can actually be revoked.
 *
 * A plain JWT cannot be revoked — it is valid until it expires, wherever it turns up.
 * Persisting the refresh side means logout, a password change, or a deactivated college
 * can all invalidate a session immediately. That is the reason for the extra collection.
 *
 * **Only a SHA-256 hash of the token is stored, never the token itself.** A leaked
 * database dump therefore yields nothing usable, exactly as with password hashes.
 * (SHA-256 rather than bcrypt is correct here: the token is 256 bits of cryptographic
 * randomness, so there is no low-entropy guess to slow down, and refresh runs on a hot
 * path where bcrypt's cost would be paid on every rotation for no security gain.)
 */
const refreshTokenSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: { type: String, required: true, unique: true },

    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },

    /**
     * Set when this token is rotated, pointing at its successor. If a token that was
     * already replaced is presented again, it has been stolen and replayed, and every
     * session for that user is dropped.
     */
    replacedByHash: { type: String, default: null },

    userAgent: { type: String, default: null, maxlength: 300 },
  },
  { timestamps: true },
);

/**
 * A TTL index: MongoDB deletes each document once `expiresAt` passes, so expired
 * sessions clear themselves instead of accumulating. `expireAfterSeconds: 0` means
 * "expire at the time in this field", not "expire immediately".
 */
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RefreshToken = InferSchemaType<typeof refreshTokenSchema>;
export type RefreshTokenDocument = HydratedDocument<RefreshToken>;

export const RefreshTokenModel = model('RefreshToken', refreshTokenSchema);
