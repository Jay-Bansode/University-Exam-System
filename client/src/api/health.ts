import { useQuery } from '@tanstack/react-query';
import type { HealthResponse } from '@ues/shared';
import { api } from './client';

export const healthQueryKey = ['health'] as const;

/**
 * Polls the API health endpoint.
 *
 * Retries generously on purpose. The API sleeps on Render's free tier, so the first
 * request after an idle period reliably fails or hangs before the instance is awake.
 * Treating that as a hard error would make a healthy system look broken to whoever
 * opens the link first.
 */
export function useHealth() {
  return useQuery({
    queryKey: healthQueryKey,
    queryFn: () => api.get<HealthResponse>('/health'),
    retry: 3,
    retryDelay: (attempt) => Math.min(2000 * 2 ** attempt, 15_000),
    staleTime: 30_000,
  });
}
