import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CorrectionStatus, ExamFormStatus } from '@ues/shared';
import { useAuth } from '@/hooks/use-auth';
import { useUsers } from '@/api/users';
import { useVerificationQueue } from '@/api/verification';
import { useCorrectionQueue } from '@/api/corrections';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { paths } from '@/routes/paths';

/**
 * The clerk's landing page: what is waiting, and a way to find a student.
 */
export default function ClerkDashboard() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');

  const { data: queue } = useVerificationQueue({ status: ExamFormStatus.Submitted });
  const { data: tickets } = useCorrectionQueue(CorrectionStatus.Pending);
  const { data: students, isPending, isError } = useUsers({ role: 'student', search });

  const waiting = queue?.counts.submitted ?? 0;
  const pendingTickets = tickets?.length ?? 0;

  return (
    <>
      <PageHeader title="Clerk" subtitle={user?.college?.name ?? 'Your college'} />

      <div
        className={`mb-5 rounded-xl p-4 ring-1 ring-inset ${
          waiting > 0 ? 'bg-amber-50 ring-amber-200' : 'bg-slate-50 ring-slate-200'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">
              {waiting > 0
                ? `${waiting} form${waiting === 1 ? '' : 's'} awaiting verification`
                : 'Nothing awaiting verification'}
            </h2>
            <p className="mt-0.5 text-sm text-slate-700">
              {waiting > 0
                ? 'Check each against the documents the student brings in.'
                : 'Submitted forms appear here as students hand them in.'}
            </p>
          </div>

          <Link to={paths.clerkVerification}>
            <Button size="sm">Open queue</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <h2 className="font-semibold text-slate-900">Find a student</h2>

          <label htmlFor="student-search" className="sr-only">
            Search students by name
          </label>
          <input
            id="student-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by first or last name"
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          />

          <p className="mt-2 text-xs text-slate-500">
            Results are filtered to your college on the server, never in the browser.
          </p>

          <div className="mt-4">
            {isPending && <p className="text-sm text-slate-500">Searching…</p>}
            {isError && <p className="text-sm text-rose-800">Could not load students.</p>}
            {students && students.length === 0 && (
              <p className="text-sm text-slate-500">No students match that name.</p>
            )}
            {students && students.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {students.map((student) => (
                  <li
                    key={student.id}
                    className="flex flex-wrap justify-between gap-2 py-2.5"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{student.fullName}</p>
                      <p className="text-xs text-slate-500">{student.email}</p>
                    </div>
                    <p className="text-sm text-slate-600">
                      {student.student?.rollNumber || '—'}
                      {student.student?.currentSemester
                        ? ` · Sem ${student.student.currentSemester}`
                        : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Correction requests</h2>
            <Link
              to={paths.clerkCorrections}
              className="text-sm font-medium text-brand-700 underline-offset-2 hover:underline"
            >
              Open
            </Link>
          </div>

          <p className="mt-2 text-sm text-slate-600">
            {pendingTickets > 0
              ? `${pendingTickets} student${pendingTickets === 1 ? '' : 's'} waiting for a name, date of birth or photograph change.`
              : 'No correction requests waiting.'}
          </p>
        </section>
      </div>
    </>
  );
}
