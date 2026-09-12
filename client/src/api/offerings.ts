import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OfferableSubject, OfferingDetail, SaveOfferingRequest } from '@ues/shared';
import { api } from './client';

/**
 * Semester offerings — what this college teaches.
 *
 * As everywhere else, no call names a college: the server derives the tenant from the
 * access token.
 */

const offeringsKey = ['offerings'] as const;

export function useOfferings(
  filter: { streamId?: string; semester?: number; academicYear?: string } = {},
) {
  const params = new URLSearchParams();
  if (filter.streamId) params.set('streamId', filter.streamId);
  if (filter.semester) params.set('semester', String(filter.semester));
  if (filter.academicYear) params.set('academicYear', filter.academicYear);
  const queryString = params.toString();

  return useQuery({
    queryKey: [...offeringsKey, filter.streamId ?? null, filter.semester ?? null],
    queryFn: () =>
      api.get<{ offerings: OfferingDetail[] }>(
        `/offerings${queryString ? `?${queryString}` : ''}`,
      ),
    select: (data) => data.offerings,
  });
}

/**
 * The subjects available to put in an offering.
 *
 * Uses the tenant-checked endpoint rather than the open `/subjects` list, so the picker
 * cannot show subjects for a branch this college does not teach.
 */
export function useOfferableSubjects(streamId: string | null, semester: number | null) {
  return useQuery({
    queryKey: ['offerable-subjects', streamId, semester],
    queryFn: () =>
      api.get<{ subjects: OfferableSubject[] }>(
        `/offerings/available-subjects?streamId=${streamId}&semester=${semester}`,
      ),
    select: (data) => data.subjects,
    enabled: Boolean(streamId && semester),
  });
}

export function useSaveOffering() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveOfferingRequest) =>
      api.put<{ offering: OfferingDetail }>('/offerings', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: offeringsKey }),
  });
}

export function useDeleteOffering() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete<{ deleted: boolean }>(`/offerings/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: offeringsKey }),
  });
}
