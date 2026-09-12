import { ROLE_LABELS, type Role } from '@ues/shared';
import { useUsers } from '@/api/users';

/**
 * Lists the users visible to the signed-in staff member.
 *
 * Used across the staff dashboards as live evidence of tenant scoping: a college's clerk
 * sees five people, the other college's clerk sees a different five, and the university
 * admin sees every one of them — all from the same component and the same request, with
 * only the token differing.
 */
export function UserTable({ role }: { role?: string }) {
  const { data, isPending, isError, error } = useUsers(role ? { role } : {});

  if (isPending) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-11 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset">
        {error instanceof Error ? error.message : 'Could not load users.'}
      </p>
    );
  }

  if (data.length === 0) {
    return <p className="text-sm text-slate-500">No users to show yet.</p>;
  }

  return (
    // The wrapper scrolls rather than the page, so a wide table never forces the whole
    // layout sideways on a phone.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs tracking-wide text-slate-500 uppercase">
            <th scope="col" className="py-2 pr-4 font-medium">
              Name
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Role
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Roll no.
            </th>
            <th scope="col" className="py-2 font-medium">
              Sem
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((user) => (
            <tr key={user.id} className="border-b border-slate-100 last:border-0">
              <td className="py-2.5 pr-4">
                <span className="block font-medium text-slate-900">{user.fullName}</span>
                <span className="block text-xs text-slate-500">{user.email}</span>
              </td>
              <td className="py-2.5 pr-4 text-slate-600">
                {ROLE_LABELS[user.role as Role] ?? user.role}
              </td>
              <td className="py-2.5 pr-4 text-slate-600">
                {user.student?.rollNumber || '—'}
              </td>
              <td className="py-2.5 text-slate-600">
                {user.student?.currentSemester ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
