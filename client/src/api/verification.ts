import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExamFormQueueResponse, ExamFormSummary } from '@ues/shared';
import { api } from './client';

/**
 * The clerk's verification queue.
 *
 * Tenant-scoped on the server, so there is no college parameter here either.
 */

const queueKey = ['exam-forms', 'queue'] as const;

export function useVerificationQueue(options: { status?: string; search?: string } = {}) {
  const params = new URLSearchParams();
  if (options.status) params.set('status', options.status);
  if (options.search?.trim()) params.set('search', options.search.trim());
  const queryString = params.toString();

  return useQuery({
    queryKey: [...queueKey, options.status ?? null, options.search ?? null],
    queryFn: () =>
      api.get<ExamFormQueueResponse>(
        `/exam-forms${queryString ? `?${queryString}` : ''}`,
      ),
  });
}

function useInvalidateQueue() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['exam-forms'] });
}

export function useVerifyForm() {
  const invalidate = useInvalidateQueue();

  return useMutation({
    mutationFn: (id: string) =>
      api.patch<{ form: ExamFormSummary }>(`/exam-forms/${id}/verify`),
    onSuccess: invalidate,
  });
}

export function useRejectForm() {
  const invalidate = useInvalidateQueue();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.patch<{ form: ExamFormSummary }>(`/exam-forms/${id}/reject`, { reason }),
    onSuccess: invalidate,
  });
}
