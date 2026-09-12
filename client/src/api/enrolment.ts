import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddCollegeStreamRequest,
  CollegeStreamDetail,
  CreateUserRequest,
  CreateUserResponse,
  ManagedUser,
  ResetPasswordResponse,
  UpdateUserRequest,
} from '@ues/shared';
import { api } from './client';

/**
 * College-level people and programme management.
 *
 * No call here names a college. The server derives the tenant from the access token, so
 * there is simply no parameter through which a client could ask for another college's
 * roster.
 */

const collegeStreamsKey = ['college-streams'] as const;
const usersKey = ['users'] as const;

export function useCollegeStreams() {
  return useQuery({
    queryKey: collegeStreamsKey,
    queryFn: () => api.get<{ streams: CollegeStreamDetail[] }>('/college-streams'),
    select: (data) => data.streams,
  });
}

/**
 * Invalidates both lists on every write.
 *
 * They are genuinely coupled: enrolling a student changes their stream's student count,
 * and removing a stream changes who can be enrolled. Refreshing one without the other
 * leaves a stale number on screen.
 */
function useInvalidateEnrolment() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: collegeStreamsKey }),
      queryClient.invalidateQueries({ queryKey: usersKey }),
    ]);
  };
}

export function useAddCollegeStream() {
  const invalidate = useInvalidateEnrolment();
  return useMutation({
    mutationFn: (input: AddCollegeStreamRequest) =>
      api.post<{ streams: CollegeStreamDetail[] }>('/college-streams', input),
    onSuccess: invalidate,
  });
}

export function useRemoveCollegeStream() {
  const invalidate = useInvalidateEnrolment();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ removed: boolean }>(`/college-streams/${id}`),
    onSuccess: invalidate,
  });
}

export function useCreateUser() {
  const invalidate = useInvalidateEnrolment();
  return useMutation({
    mutationFn: (input: CreateUserRequest) =>
      api.post<CreateUserResponse>('/users', input),
    onSuccess: invalidate,
  });
}

export function useUpdateUser() {
  const invalidate = useInvalidateEnrolment();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateUserRequest & { id: string }) =>
      api.patch<{ user: ManagedUser }>(`/users/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useSetUserStatus() {
  const invalidate = useInvalidateEnrolment();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch<{ user: ManagedUser }>(`/users/${id}/status`, { isActive }),
    onSuccess: invalidate,
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ResetPasswordResponse>(`/users/${id}/reset-password`),
  });
}
