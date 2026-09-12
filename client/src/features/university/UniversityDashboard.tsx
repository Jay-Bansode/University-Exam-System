import { Link } from 'react-router-dom';
import { useColleges } from '@/api/colleges';
import { useExamWindows } from '@/api/exam-windows';
import { PageHeader } from '@/components/PageHeader';
import { paths } from '@/routes/paths';

/**
 * The university tier's overview. The only role whose queries read across colleges.
 */
export default function UniversityDashboard() {
  const { data: colleges, isPending } = useColleges();
  const { data: windows, isPending: windowsPending } = useExamWindows();

  const openWindows = (windows ?? []).filter((examWindow) => examWindow.isOpenNow);

  const totals = (colleges ?? []).reduce(
    (accumulator, college) => ({
      colleges: accumulator.colleges + 1,
      active: accumulator.active + (college.isActive ? 1 : 0),
      students: accumulator.students + college.stats.students,
      staff:
        accumulator.staff +
        college.stats.collegeAdmins +
        college.stats.faculty +
        college.stats.clerks,
    }),
    { colleges: 0, active: 0, students: 0, staff: 0 },
  );

  return (
    <>
      <PageHeader
        title="University administration"
        subtitle="Every affiliated college, the master syllabus, and the exam registration window."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Colleges" value={totals.colleges} isPending={isPending} />
        <StatCard label="Active" value={totals.active} isPending={isPending} />
        <StatCard label="Staff" value={totals.staff} isPending={isPending} />
        <StatCard label="Students" value={totals.students} isPending={isPending} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Affiliated colleges</h2>
            <Link
              to={paths.universityColleges}
              className="text-sm font-medium text-brand-700 underline-offset-2 hover:underline"
            >
              Manage colleges
            </Link>
          </div>

          {isPending ? (
            <div className="mt-4 space-y-2" aria-busy="true">
              {[0, 1].map((row) => (
                <div key={row} className="h-10 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {(colleges ?? []).map((college) => (
                <li
                  key={college.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{college.name}</p>
                    <p className="text-xs text-slate-500">
                      {college.code} · {college.stats.total} people
                    </p>
                  </div>
                  {!college.isActive && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                      Deactivated
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-900">Registration windows</h2>
              <Link
                to={paths.universityExamWindows}
                className="text-sm font-medium text-brand-700 underline-offset-2 hover:underline"
              >
                Manage
              </Link>
            </div>

            {windowsPending ? (
              <div className="mt-3 h-10 animate-pulse rounded-lg bg-slate-100" />
            ) : openWindows.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {openWindows.map((examWindow) => (
                  <li
                    key={examWindow.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="text-slate-900">Semester {examWindow.semester}</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
                      Open now
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                No window is currently open, so no college can accept exam forms.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-900">Registration progress</h2>
            <p className="mt-2 text-sm text-slate-600">
              How far each college has got with the open semester, including students who
              have not started their form at all.
            </p>
            <Link
              to={paths.universityStatistics}
              className="mt-3 inline-block text-sm font-medium text-brand-700 underline underline-offset-2"
            >
              View statistics
            </Link>
          </section>
        </div>
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  isPending,
}: {
  label: string;
  value: number;
  isPending: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs tracking-wide text-slate-500 uppercase">{label}</p>
      {isPending ? (
        <div className="mt-1 h-7 w-10 animate-pulse rounded bg-slate-100" />
      ) : (
        <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      )}
    </div>
  );
}
