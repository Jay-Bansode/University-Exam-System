import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateExamWindowRequest,
  ExamWindowDetail,
  UpdateExamWindowRequest,
} from '@ues/shared';
import { api } from './client';

const examWindowsKey = ['exam-windows'] as const;

/**
 * Exam windows.
 *
 * `staleTime` is short because whether a window is open changes on its own as time
 * passes — unlike the syllabus, which only changes when someone edits it.
 */
export function useExamWindows() {
  return useQuery({
    queryKey: examWindowsKey,
    queryFn: () => api.get<{ windows: ExamWindowDetail[] }>('/exam-windows'),
    select: (data) => data.windows,
    staleTime: 30_000,
  });
}

function useInvalidateExamWindows() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: examWindowsKey });
}

export function useCreateExamWindow() {
  const invalidate = useInvalidateExamWindows();
  return useMutation({
    mutationFn: (input: CreateExamWindowRequest) =>
      api.post<{ window: ExamWindowDetail }>('/exam-windows', input),
    onSuccess: invalidate,
  });
}

export function useUpdateExamWindow() {
  const invalidate = useInvalidateExamWindows();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateExamWindowRequest & { id: string }) =>
      api.patch<{ window: ExamWindowDetail }>(`/exam-windows/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteExamWindow() {
  const invalidate = useInvalidateExamWindows();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ deleted: boolean }>(`/exam-windows/${id}`),
    onSuccess: invalidate,
  });
}
