import { useState } from 'react';
import { ROLE_LABELS, Role, type ManagedUser } from '@ues/shared';
import { useUsers } from '@/api/users';
import {
  useCollegeStreams,
  useResetUserPassword,
  useSetUserStatus,
} from '@/api/enrolment';
import { ApiError } from '@/api/client';
import { useAuth } from '@/hooks/use-auth';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { UserFormModal } from './UserFormModal';
import { TemporaryPasswordPanel } from './TemporaryPasswordPanel';

const ROLE_FILTERS = [
  { value: '', label: 'Everyone' },
  { value: Role.Faculty, label: 'Faculty' },
  { value: Role.Clerk, label: 'Clerks' },
  { value: Role.Student, label: 'Students' },
];

/**
 * The college's roster.
 *
 * Everything on this page is scoped to the signed-in admin's own college by the server.
 * There is no college selector, because there is nothing to select — the tenant comes
 * from the access token.
 */
export default function PeoplePage() {
  const { user: me } = useAuth();

  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | undefined>();
  const [resetFor, setResetFor] = useState<{
    user: ManagedUser;
    password: string;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: streams } = useCollegeStreams();
  const {
    data: people,
    isPending,
    isError,
  } = useUsers({ ...(roleFilter ? { role: roleFilter } : {}), search });

  const setStatus = useSetUserStatus();
  const resetPassword = useResetUserPassword();

  const toggleStatus = async (person: ManagedUser) => {
    setActionError(null);

    if (person.isActive) {
      const confirmed = window.confirm(
        `Deactivate ${person.fullName}? They will be signed out immediately and unable to sign in. No records are deleted.`,
      );
      if (!confirmed) return;
    }

    try {
      await setStatus.mutateAsync({ id: person.id, isActive: !person.isActive });
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Could not update.');
    }
  };

  const issueNewPassword = async (person: ManagedUser) => {
    setActionError(null);

    const confirmed = window.confirm(
      `Issue a new password for ${person.fullName}? Their current password stops working and any active session ends.`,
    );
    if (!confirmed) return;

    try {
      const result = await resetPassword.mutateAsync(person.id);
      setResetFor({ user: person, password: result.temporaryPassword });
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Could not reset.');
    }
  };

  return (
    <>
      <PageHeader
        title="People"
        subtitle="Faculty, clerks and students at this college."
        action={
          <Button
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            Add person
          </Button>
        }
      />

      {actionError && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset"
        >
          {actionError}
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="flex flex-wrap gap-1">
          {ROLE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setRoleFilter(filter.value)}
              aria-pressed={roleFilter === filter.value}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                roleFilter === filter.value
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-slate-700 ring-1 ring-slate-200 ring-inset hover:bg-slate-50'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <label htmlFor="people-search" className="sr-only">
          Search by name
        </label>
        <input
          id="people-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by first or last name"
          className="min-w-48 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none"
        />
      </div>

      {isPending && (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-16 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      )}

      {isError && (
        <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset">
          Could not load people.
        </p>
      )}

      {people && people.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-medium text-slate-900">Nobody matches</p>
          <p className="mt-1 text-sm text-slate-600">
            Try a different filter, or add someone.
          </p>
        </div>
      )}

      {people && people.length > 0 && (
        <ul className="space-y-2">
          {people.map((person) => (
            <li
              key={person.id}
              className={`rounded-xl border border-slate-200 p-4 ${
                person.isActive ? 'bg-white' : 'bg-slate-50'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900">{person.fullName}</p>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                      {ROLE_LABELS[person.role]}
                    </span>
                    {!person.isActive && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                        Deactivated
                      </span>
                    )}
                    {person.id === me?.id && (
                      <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-900">
                        You
                      </span>
                    )}
                  </div>

                  <p className="mt-0.5 text-xs text-slate-500">{person.email}</p>

                  {person.student && (
                    <p className="mt-1 text-sm text-slate-600">
                      {person.student.rollNumber} · {person.student.streamName} · Semester{' '}
                      {person.student.currentSemester}
                      {person.student.entryType === 'lateral' && ' · Direct Second Year'}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditing(person);
                      setFormOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void issueNewPassword(person)}
                    disabled={resetPassword.isPending}
                  >
                    New password
                  </Button>
                  {/* Deactivating yourself would lock the college out of its own
                      administration, so the option is not offered. */}
                  {person.id !== me?.id && (
                    <Button
                      size="sm"
                      variant={person.isActive ? 'secondary' : 'primary'}
                      onClick={() => void toggleStatus(person)}
                      disabled={setStatus.isPending}
                    >
                      {person.isActive ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {formOpen && (
        <UserFormModal
          onClose={() => setFormOpen(false)}
          streams={streams ?? []}
          user={editing}
        />
      )}

      {resetFor && (
        <Modal onClose={() => setResetFor(null)} title="New password issued">
          <TemporaryPasswordPanel
            heading={`${resetFor.user.fullName} must use this password to sign in.`}
            email={resetFor.user.email}
            password={resetFor.password}
            onDone={() => setResetFor(null)}
          />
        </Modal>
      )}
    </>
  );
}
