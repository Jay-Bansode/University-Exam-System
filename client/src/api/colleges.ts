import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CollegeDetail,
  CollegeWithStats,
  CreateCollegeAdminRequest,
  CreateCollegeAdminResponse,
  CreateCollegeRequest,
  UpdateCollegeRequest,
} from '@ues/shared';
import { api } from './client';

/**
 * College queries and mutations.
 *
 * Every mutation invalidates the same list key on success, so the table reflects the
 * change without any manual state juggling. That is the main reason server state lives
 * in React Query rather than `useState`: there is one cache, and one way to refresh it.
 */

const collegesKey = ['colleges'] as const;

export function useColleges() {
  return useQuery({
    queryKey: collegesKey,
    queryFn: () => api.get<{ colleges: CollegeWithStats[] }>('/colleges'),
    select: (data) => data.colleges,
  });
}

function useInvalidateColleges() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: collegesKey });
}

export function useCreateCollege() {
  const invalidate = useInvalidateColleges();

  return useMutation({
    mutationFn: (input: CreateCollegeRequest) =>
      api.post<{ college: CollegeDetail }>('/colleges', input),
    onSuccess: invalidate,
  });
}

export function useUpdateCollege() {
  const invalidate = useInvalidateColleges();

  return useMutation({
    mutationFn: ({ id, ...input }: UpdateCollegeRequest & { id: string }) =>
      api.patch<{ college: CollegeDetail }>(`/colleges/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useSetCollegeStatus() {
  const invalidate = useInvalidateColleges();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch<{ college: CollegeDetail }>(`/colleges/${id}/status`, { isActive }),
    onSuccess: invalidate,
  });
}

export function useDeleteCollege() {
  const invalidate = useInvalidateColleges();

  return useMutation({
    mutationFn: (id: string) => api.delete<{ deleted: boolean }>(`/colleges/${id}`),
    onSuccess: invalidate,
  });
}

export function useCreateCollegeAdmin() {
  const invalidate = useInvalidateColleges();

  return useMutation({
    mutationFn: ({
      collegeId,
      ...input
    }: CreateCollegeAdminRequest & { collegeId: string }) =>
      api.post<CreateCollegeAdminResponse>(`/colleges/${collegeId}/admins`, input),
    onSuccess: invalidate,
  });
}
