import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CorrectionRequestDetail,
  CreateCorrectionRequest,
  UploadSignature,
} from '@ues/shared';
import { api } from './client';

/** Correction request tickets. */

const myTicketsKey = ['corrections', 'me'] as const;
const queueKey = ['corrections', 'queue'] as const;

export function useMyCorrectionRequests() {
  return useQuery({
    queryKey: myTicketsKey,
    queryFn: () =>
      api.get<{ requests: CorrectionRequestDetail[] }>('/correction-requests/me'),
    select: (data) => data.requests,
  });
}

export function useCorrectionQueue(status?: string) {
  return useQuery({
    queryKey: [...queueKey, status ?? null],
    queryFn: () =>
      api.get<{ requests: CorrectionRequestDetail[] }>(
        `/correction-requests${status ? `?status=${status}` : ''}`,
      ),
    select: (data) => data.requests,
  });
}

function useInvalidateCorrections() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['corrections'] }),
      // Approving a ticket rewrites the student's own name or photo, so the session's
      // cached user is stale too.
      queryClient.invalidateQueries({ queryKey: ['users'] }),
    ]);
  };
}

export function useCreateCorrectionRequest() {
  const invalidate = useInvalidateCorrections();

  return useMutation({
    mutationFn: (input: CreateCorrectionRequest) =>
      api.post<{ request: CorrectionRequestDetail }>('/correction-requests', input),
    onSuccess: invalidate,
  });
}

export function useApproveCorrection() {
  const invalidate = useInvalidateCorrections();

  return useMutation({
    mutationFn: (id: string) =>
      api.patch<{ request: CorrectionRequestDetail }>(
        `/correction-requests/${id}/approve`,
      ),
    onSuccess: invalidate,
  });
}

export function useDeclineCorrection() {
  const invalidate = useInvalidateCorrections();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.patch<{ request: CorrectionRequestDetail }>(
        `/correction-requests/${id}/decline`,
        { reason },
      ),
    onSuccess: invalidate,
  });
}

/**
 * Whether photograph uploads are available, and the signed parameters if so.
 *
 * A deployment without Cloudinary configured answers `configured: false` rather than
 * erroring, so the form can hide the photo option instead of offering something that
 * cannot work.
 */
export function useUploadSignature() {
  return useQuery({
    queryKey: ['upload-signature'],
    queryFn: () =>
      api.get<{ configured: boolean; signature: UploadSignature | null }>(
        '/uploads/photo-signature',
      ),
    // A signature carries a timestamp and does not stay valid indefinitely.
    staleTime: 5 * 60_000,
  });
}

/**
 * Uploads a file straight from the browser to Cloudinary.
 *
 * The file never passes through our API: Render's free tier has no persistent disk, and
 * streaming an image through Node would cost memory and request time for nothing. The
 * server's only involvement was signing the request.
 */
export async function uploadPhoto(
  file: File,
  signature: UploadSignature,
): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signature.apiKey);
  form.append('timestamp', String(signature.timestamp));
  form.append('folder', signature.folder);
  form.append('signature', signature.signature);

  const response = await fetch(signature.uploadUrl, { method: 'POST', body: form });

  if (!response.ok) {
    throw new Error('The photograph could not be uploaded. Please try again.');
  }

  const result = (await response.json()) as { secure_url?: string };

  if (!result.secure_url) {
    throw new Error('The upload did not return a usable image.');
  }

  return result.secure_url;
}
