import { Link } from 'react-router-dom';
import { Role } from '@ues/shared';
import { useAuth } from '@/hooks/use-auth';
import { useUsers } from '@/api/users';
import { useCollegeStreams } from '@/api/enrolment';
import { useExamWindows } from '@/api/exam-windows';
import { PageHeader } from '@/components/PageHeader';
import { PhaseNotice } from '@/components/PhaseNotice';
import { paths } from '@/routes/paths';

export default function CollegeDashboard() {
  const { user } = useAuth();

  const { data: people, isPending: peoplePending } = useUsers();
  const { data: streams, isPending: streamsPending } = useCollegeStreams();
  const { data: windows } = useExamWindows();

  const counts = (people ?? []).reduce(
    (accumulator, person) => ({
      ...accumulator,
      [person.role]: (accumulator[person.role] ?? 0) + 1,
    }),
    {} as Record<string, number>,
  );

  const openWindows = (windows ?? []).filter((examWindow) => examWindow.isOpenNow);

  return (
    <>
      <PageHeader
        title="College administration"
        subtitle={user?.college?.name ?? 'Your college'}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Students"
          value={counts[Role.Student] ?? 0}
          isPending={peoplePending}
          to={paths.collegePeople}
        />
        <StatCard
          label="Faculty"
          value={counts[Role.Faculty] ?? 0}
          isPending={peoplePending}
          to={paths.collegePeople}
        />
        <StatCard
          label="Clerks"
          value={counts[Role.Clerk] ?? 0}
          isPending={peoplePending}
          to={paths.collegePeople}
        />
        <StatCard
          label="Streams"
          value={streams?.length ?? 0}
          isPending={streamsPending}
          to={paths.collegeStreams}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Streams offered</h2>
            <Link
              to={paths.collegeStreams}
              className="text-sm font-medium text-brand-700 underline-offset-2 hover:underline"
            >
              Manage
            </Link>
          </div>

          {streamsPending ? (
            <div className="mt-4 h-10 animate-pulse rounded-lg bg-slate-100" />
          ) : streams && streams.length > 0 ? (
            <ul className="mt-3 divide-y divide-slate-100">
              {streams.map((stream) => (
                <li
                  key={stream.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                >
                  <div>
                    <p className="font-medium text-slate-900">{stream.streamName}</p>
                    <p className="text-xs text-slate-500">
                      {stream.streamCode} · {stream.programType}
                    </p>
                  </div>
                  <p className="text-sm text-slate-600">
                    {stream.studentCount} student{stream.studentCount === 1 ? '' : 's'}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              No streams offered yet. Add one before enrolling students.
            </p>
          )}
        </section>

        <div className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-900">Exam registration</h2>
            {openWindows.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {openWindows.map((examWindow) => (
                  <li
                    key={examWindow.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="text-slate-900">Semester {examWindow.semester}</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
                      Open
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                No window is open. The university controls the registration calendar.
              </p>
            )}
          </section>

          <PhaseNotice
            phase="Phases 5 to 8"
            items={[
              'Faculty activate subjects for the live semester',
              'Students fill and print the exam form',
              'Clerks verify forms and correction tickets',
            ]}
          />
        </div>
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  isPending,
  to,
}: {
  label: string;
  value: number;
  isPending: boolean;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-brand-300"
    >
      <p className="text-xs tracking-wide text-slate-500 uppercase">{label}</p>
      {isPending ? (
        <div className="mt-1 h-7 w-10 animate-pulse rounded bg-slate-100" />
      ) : (
        <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      )}
    </Link>
  );
}
