import { useQuery } from '@tanstack/react-query';
import type { ManagedUser } from '@ues/shared';
import { api } from './client';

/**
 * Lists users the caller is allowed to see.
 *
 * Note the absence of a college parameter. The server derives the tenant from the access
 * token, so there is deliberately no way for the client to ask for another college's
 * users — the request cannot express it.
 *
 * The `ManagedUser` shape is shared with the college roster, so there is one list
 * representation across the app rather than two that drift.
 */
export function useUsers(options: { role?: string; search?: string } = {}) {
  const params = new URLSearchParams();
  if (options.role) params.set('role', options.role);
  if (options.search?.trim()) params.set('search', options.search.trim());

  const queryString = params.toString();

  return useQuery({
    queryKey: ['users', options.role ?? null, options.search ?? null],
    queryFn: () =>
      api.get<{ users: ManagedUser[] }>(`/users${queryString ? `?${queryString}` : ''}`),
    select: (data) => data.users,
  });
}
