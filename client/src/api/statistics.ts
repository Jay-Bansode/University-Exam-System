import { useQuery } from '@tanstack/react-query';
import type { StatisticsResponse } from '@ues/shared';
import { api } from './client';

/**
 * Cross-college statistics. University admin only — the server enforces it, and this is
 * the one read in the app that is deliberately not tenant-scoped.
 */
export function useStatistics() {
  return useQuery({
    queryKey: ['statistics'],
    queryFn: () => api.get<StatisticsResponse>('/statistics'),
    // Figures move as students submit, so this is refreshed more eagerly than
    // configuration data that only changes when someone edits it.
    staleTime: 60_000,
  });
}
