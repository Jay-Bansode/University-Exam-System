import { ApiError } from '@/api/client';

/**
 * Splits an API failure into per-field errors and a single form-level message.
 *
 * A 422 from Zod carries `details` keyed by field path, which belongs beside the input.
 * A 409 conflict or a network failure has no field, so it belongs at the top of the
 * form. Doing this once keeps every form's error handling identical.
 */
export type FormErrors = {
  fields: Record<string, string[]>;
  message: string | null;
};

export const NO_ERRORS: FormErrors = { fields: {}, message: null };

export function toFormErrors(error: unknown): FormErrors {
  if (error instanceof ApiError) {
    if (error.details && Object.keys(error.details).length > 0) {
      return { fields: error.details, message: null };
    }

    if (error.isConnectivityProblem) {
      return {
        fields: {},
        message: 'Could not reach the server. It may be waking up — try again shortly.',
      };
    }

    return { fields: {}, message: error.message };
  }

  return { fields: {}, message: 'Something went wrong. Please try again.' };
}
