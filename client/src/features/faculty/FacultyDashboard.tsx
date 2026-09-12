import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { useOfferings } from '@/api/offerings';
import { useCollegeStreams } from '@/api/enrolment';
import { useExamWindows } from '@/api/exam-windows';
import { PageHeader } from '@/components/PageHeader';
import { PhaseNotice } from '@/components/PhaseNotice';
import { UserTable } from '@/components/UserTable';
import { paths } from '@/routes/paths';

export default function FacultyDashboard() {
  const { user } = useAuth();

  const { data: offerings, isPending: offeringsPending } = useOfferings();
  const { data: streams } = useCollegeStreams();
  const { data: windows } = useExamWindows();

  const openWindows = (windows ?? []).filter((examWindow) => examWindow.isOpenNow);

  /**
   * Semesters where registration is open but nothing has been offered yet. This is the
   * one thing a faculty member genuinely needs to be told: students cannot register for
   * a semester until its subjects are chosen, and the window closing does not wait.
   */
  const gaps = openWindows.flatMap((examWindow) =>
    (streams ?? [])
      .filter(
        (stream) =>
          examWindow.semester <= stream.totalSemesters &&
          !(offerings ?? []).some(
            (offering) =>
              offering.streamId === stream.streamId &&
              offering.semester === examWindow.semester,
          ),
      )
      .map((stream) => ({
        key: `${stream.streamId}-${examWindow.semester}`,
        streamName: stream.streamName,
        semester: examWindow.semester,
      })),
  );

  return (
    <>
      <PageHeader title="Faculty" subtitle={user?.college?.name ?? 'Your college'} />

      {gaps.length > 0 && (
        <div className="mb-5 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200 ring-inset">
          <h2 className="font-semibold text-amber-900">
            Registration is open without an offering
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            Students cannot register for these until their subjects are chosen.
          </p>
          <ul className="mt-2 space-y-1">
            {gaps.map((gap) => (
              <li key={gap.key} className="text-sm text-amber-900">
                {gap.streamName} · Semester {gap.semester}
              </li>
            ))}
          </ul>
          <Link
            to={paths.facultyOfferings}
            className="mt-3 inline-block text-sm font-medium text-amber-900 underline underline-offset-2"
          >
            Build an offering
          </Link>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Current offerings</h2>
            <Link
              to={paths.facultyOfferings}
              className="text-sm font-medium text-brand-700 underline-offset-2 hover:underline"
            >
              Manage
            </Link>
          </div>

          {offeringsPending ? (
            <div className="mt-4 h-10 animate-pulse rounded-lg bg-slate-100" />
          ) : offerings && offerings.length > 0 ? (
            <ul className="mt-3 divide-y divide-slate-100">
              {offerings.map((offering) => (
                <li
                  key={offering.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      {offering.streamName} · Semester {offering.semester}
                    </p>
                    <p className="text-xs text-slate-500">{offering.academicYear}</p>
                  </div>
                  <p className="text-sm text-slate-600">
                    {offering.subjects.length} subjects · {offering.totalCredits} credits
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              Nothing offered yet. Choose subjects from the university syllabus.
            </p>
          )}
        </section>

        <div className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-900">Students</h2>
            <div className="mt-3">
              <UserTable role="student" />
            </div>
          </section>

          <PhaseNotice
            phase="Phases 6 to 8"
            items={[
              'Students fill and print the exam form',
              'Clerks verify forms and correction tickets',
            ]}
          />
        </div>
      </div>
    </>
  );
}
