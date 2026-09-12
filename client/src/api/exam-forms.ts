import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExamFormDetail, MyExamFormResponse } from '@ues/shared';
import { api } from './client';

/**
 * The student's own exam form.
 *
 * These endpoints take no id: the server finds the form from the access token, so there
 * is no parameter a student could change to reach a classmate's registration.
 */

const myFormKey = ['exam-form', 'me'] as const;

export function useMyExamForm() {
  return useQuery({
    queryKey: myFormKey,
    queryFn: () => api.get<MyExamFormResponse>('/exam-forms/me'),
    // Whether the window is open changes with time rather than with edits, so this is
    // re-checked more eagerly than data that only changes when someone saves.
    staleTime: 30_000,
  });
}

export function useMyExamFormHistory() {
  return useQuery({
    queryKey: ['exam-form', 'me', 'history'],
    queryFn: () => api.get<{ forms: ExamFormDetail[] }>('/exam-forms/me/history'),
    select: (data) => data.forms,
  });
}

export function useExamForm(id: string | undefined) {
  return useQuery({
    queryKey: ['exam-form', id],
    queryFn: () => api.get<{ form: ExamFormDetail }>(`/exam-forms/${id}`),
    select: (data) => data.form,
    enabled: Boolean(id),
  });
}

function useInvalidateMyForm() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['exam-form'] });
}

export function useSaveDraft() {
  const invalidate = useInvalidateMyForm();

  return useMutation({
    mutationFn: (subjectIds: string[]) =>
      api.put<{ form: ExamFormDetail }>('/exam-forms/me/draft', { subjectIds }),
    onSuccess: invalidate,
  });
}

export function useSubmitForm() {
  const invalidate = useInvalidateMyForm();

  return useMutation({
    mutationFn: (subjectIds: string[]) =>
      api.post<{ form: ExamFormDetail }>('/exam-forms/me/submit', { subjectIds }),
    onSuccess: invalidate,
  });
}
