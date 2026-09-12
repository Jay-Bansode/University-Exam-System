import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateStreamRequest,
  CreateSubjectRequest,
  StreamDetail,
  SubjectDetail,
  UpdateStreamRequest,
  UpdateSubjectRequest,
} from '@ues/shared';
import { api } from './client';

/**
 * Syllabus queries and mutations.
 *
 * Streams and subjects are invalidated together on any write. A subject changing alters
 * its stream's subject count, so refreshing one without the other would leave a stale
 * number on screen.
 */

const streamsKey = ['streams'] as const;
const subjectsKey = ['subjects'] as const;

export function useStreams() {
  return useQuery({
    queryKey: streamsKey,
    queryFn: () => api.get<{ streams: StreamDetail[] }>('/streams'),
    select: (data) => data.streams,
  });
}

export function useSubjects(filter: { streamId?: string; semester?: number } = {}) {
  const params = new URLSearchParams();
  if (filter.streamId) params.set('streamId', filter.streamId);
  if (filter.semester) params.set('semester', String(filter.semester));
  const queryString = params.toString();

  return useQuery({
    queryKey: [...subjectsKey, filter.streamId ?? null, filter.semester ?? null],
    queryFn: () =>
      api.get<{ subjects: SubjectDetail[] }>(
        `/subjects${queryString ? `?${queryString}` : ''}`,
      ),
    select: (data) => data.subjects,
    // A stream must be chosen before the subject list means anything.
    enabled: Boolean(filter.streamId),
  });
}

function useInvalidateSyllabus() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: streamsKey }),
      queryClient.invalidateQueries({ queryKey: subjectsKey }),
    ]);
  };
}

export function useCreateStream() {
  const invalidate = useInvalidateSyllabus();
  return useMutation({
    mutationFn: (input: CreateStreamRequest) =>
      api.post<{ stream: StreamDetail }>('/streams', input),
    onSuccess: invalidate,
  });
}

export function useUpdateStream() {
  const invalidate = useInvalidateSyllabus();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateStreamRequest & { id: string }) =>
      api.patch<{ stream: StreamDetail }>(`/streams/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteStream() {
  const invalidate = useInvalidateSyllabus();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ deleted: boolean }>(`/streams/${id}`),
    onSuccess: invalidate,
  });
}

export function useCreateSubject() {
  const invalidate = useInvalidateSyllabus();
  return useMutation({
    mutationFn: (input: CreateSubjectRequest) =>
      api.post<{ subject: SubjectDetail }>('/subjects', input),
    onSuccess: invalidate,
  });
}

export function useUpdateSubject() {
  const invalidate = useInvalidateSyllabus();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateSubjectRequest & { id: string }) =>
      api.patch<{ subject: SubjectDetail }>(`/subjects/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteSubject() {
  const invalidate = useInvalidateSyllabus();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ deleted: boolean }>(`/subjects/${id}`),
    onSuccess: invalidate,
  });
}
