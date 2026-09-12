import { createHash } from 'node:crypto';
import type { UploadSignature } from '@ues/shared';
import { env } from './env.js';
import { AppError } from '../utils/app-error.js';

/**
 * Cloudinary signed direct uploads.
 *
 * The browser uploads straight to Cloudinary; the file never passes through this API.
 * That matters for two reasons: Render's free tier has no persistent disk to buffer it
 * on, and a photograph travelling through a Node process consumes memory and request
 * time for no benefit.
 *
 * The server's only job is to sign the request. The API secret is used to compute that
 * signature and is never sent to the client — an unsigned upload preset would let anyone
 * on the internet upload to the account.
 */

export const PHOTO_FOLDER = 'ues/student-photos';

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
  );
}

/**
 * Signs an upload.
 *
 * Cloudinary's scheme: sort the parameters alphabetically, join them as a query string,
 * append the API secret, and take the SHA-1. Cloudinary repeats the computation with its
 * own copy of the secret and rejects the upload if the signatures differ.
 *
 * `timestamp` is part of the signed payload, which is what stops a signature captured
 * from one upload being replayed indefinitely.
 */
export function createUploadSignature(): UploadSignature {
  if (!isCloudinaryConfigured()) {
    throw AppError.badRequest(
      'Photograph uploads are not configured on this deployment.',
    );
  }

  const timestamp = Math.floor(Date.now() / 1000);

  const params: Record<string, string | number> = {
    folder: PHOTO_FOLDER,
    timestamp,
  };

  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  const signature = createHash('sha1')
    .update(`${toSign}${env.CLOUDINARY_API_SECRET}`)
    .digest('hex');

  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME!,
    apiKey: env.CLOUDINARY_API_KEY!,
    timestamp,
    folder: PHOTO_FOLDER,
    signature,
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`,
  };
}

/**
 * Confirms a submitted photo URL really came from our own Cloudinary account.
 *
 * The client uploads directly and then tells the API where the file landed, so the URL is
 * user-supplied. Without this check a student could submit any address on the internet
 * and have the system store and display it — the classic weakness of a direct-upload
 * flow.
 */
export function isOwnCloudinaryUrl(url: string): boolean {
  if (!isCloudinaryConfigured()) return false;

  try {
    const parsed = new URL(url);

    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'res.cloudinary.com' &&
      // The path always begins with the cloud name, so this pins the URL to our account
      // rather than merely to Cloudinary.
      parsed.pathname.startsWith(`/${env.CLOUDINARY_CLOUD_NAME}/`) &&
      parsed.pathname.includes(PHOTO_FOLDER)
    );
  } catch {
    return false;
  }
}
