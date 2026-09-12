import { useState } from 'react';
import type { CollegeWithStats } from '@ues/shared';
import { useColleges, useDeleteCollege, useSetCollegeStatus } from '@/api/colleges';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { ApiError } from '@/api/client';
import { CollegeFormModal } from './CollegeFormModal';
import { AddAdminModal } from './AddAdminModal';

/**
 * The university admin's college register.
 *
 * Deliberately shows deactivated colleges alongside active ones rather than hiding them:
 * an affiliation lapsing is a state to manage, not a record to make disappear.
 */
export default function CollegesPage() {
  const { data: colleges, isPending, isError, error } = useColleges();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CollegeWithStats | undefined>();
  const [adminFor, setAdminFor] = useState<CollegeWithStats | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const setStatus = useSetCollegeStatus();
  const deleteCollege = useDeleteCollege();

  const openCreate = () => {
    setEditing(undefined);
    setFormOpen(true);
  };

  const openEdit = (college: CollegeWithStats) => {
    setEditing(college);
    setFormOpen(true);
  };

  const toggleStatus = async (college: CollegeWithStats) => {
    setActionError(null);

    if (college.isActive) {
      const confirmed = window.confirm(
        `Deactivate ${college.name}?\n\nAll ${college.stats.total} of its users will be signed out and unable to sign in. No records are deleted, and this can be reversed.`,
      );
      if (!confirmed) return;
    }

    try {
      await setStatus.mutateAsync({ id: college.id, isActive: !college.isActive });
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : 'Could not update.');
    }
  };

  const remove = async (college: CollegeWithStats) => {
    setActionError(null);

    const confirmed = window.confirm(
      `Permanently delete ${college.name}? This cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      await deleteCollege.mutateAsync(college.id);
    } catch (caught) {
      // The API refuses to delete a college that still has users, and says so.
      setActionError(caught instanceof ApiError ? caught.message : 'Could not delete.');
    }
  };

  return (
    <>
      <PageHeader
        title="Affiliated colleges"
        subtitle="Each college is an isolated tenant. Its staff and students can see only their own."
        action={<Button onClick={openCreate}>Add college</Button>}
      />

      {actionError && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset"
        >
          {actionError}
        </p>
      )}

      {isPending && (
        <div className="space-y-2" aria-busy="true">
          {[0, 1].map((row) => (
            <div key={row} className="h-20 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      )}

      {isError && (
        <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset">
          {error instanceof Error ? error.message : 'Could not load colleges.'}
        </p>
      )}

      {colleges && colleges.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-medium text-slate-900">No colleges yet</p>
          <p className="mt-1 text-sm text-slate-600">
            Add the first affiliated college to get started.
          </p>
          <Button className="mt-4" onClick={openCreate}>
            Add college
          </Button>
        </div>
      )}

      {colleges && colleges.length > 0 && (
        <ul className="space-y-3">
          {colleges.map((college) => (
            <li
              key={college.id}
              className={`rounded-xl border bg-white p-4 sm:p-5 ${
                college.isActive ? 'border-slate-200' : 'border-slate-200 bg-slate-50'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-slate-900">{college.name}</h2>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                      {college.code}
                    </span>
                    {!college.isActive && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                        Deactivated
                      </span>
                    )}
                  </div>

                  <p className="mt-0.5 text-sm text-slate-600">
                    {[
                      college.city,
                      college.affiliationYear
                        ? `Affiliated ${college.affiliationYear}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'No location recorded'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(college)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setAdminFor(college)}
                    disabled={!college.isActive}
                  >
                    Add admin
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void toggleStatus(college)}
                    disabled={setStatus.isPending}
                  >
                    {college.isActive ? 'Deactivate' : 'Reactivate'}
                  </Button>
                  {college.stats.total === 0 && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void remove(college)}
                      disabled={deleteCollege.isPending}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>

              <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 pt-3 text-sm">
                <Stat label="Admins" value={college.stats.collegeAdmins} />
                <Stat label="Faculty" value={college.stats.faculty} />
                <Stat label="Clerks" value={college.stats.clerks} />
                <Stat label="Students" value={college.stats.students} />
              </dl>
            </li>
          ))}
        </ul>
      )}

      {/* Mounted only while open, so each dialog starts from clean state and no effect
          has to copy props into it. */}
      {formOpen && (
        <CollegeFormModal onClose={() => setFormOpen(false)} college={editing} />
      )}

      {adminFor && <AddAdminModal onClose={() => setAdminFor(null)} college={adminFor} />}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}
