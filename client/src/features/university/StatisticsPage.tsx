import type { CollegeStatistics } from '@ues/shared';
import { useStatistics } from '@/api/statistics';
import { PageHeader } from '@/components/PageHeader';

/**
 * Registration progress across every affiliated college.
 *
 * The only screen in the system that reads across tenants, and the reason the university
 * tier is more than a configuration area: it answers "are colleges actually getting their
 * students registered before the window closes?".
 *
 * The column that matters is **not started** — students with no form at all. A draft is
 * someone who began; not-started is someone who has not, and they are who a college needs
 * to chase.
 */
export default function StatisticsPage() {
  const { data, isPending, isError } = useStatistics();

  if (isPending) {
    return (
      <>
        <PageHeader title="Registration statistics" />
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        <PageHeader title="Registration statistics" />
        <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset">
          Could not load statistics.
        </p>
      </>
    );
  }

  const { totals, byCollege, bySemester, academicYear, semesters } = data;

  if (!academicYear) {
    return (
      <>
        <PageHeader title="Registration statistics" />
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-medium text-slate-900">Nothing to report yet</p>
          <p className="mt-1 text-sm text-slate-600">
            Publish an exam registration window and figures will appear here.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Registration statistics"
        subtitle={`${academicYear} · semester${semesters.length === 1 ? '' : 's'} ${semesters.join(', ')}`}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Colleges" value={totals.activeColleges} />
        <Stat label="Students" value={totals.students} />
        <Stat label="Not started" value={totals.notStarted} tone="warn" />
        <Stat label="Draft" value={totals.draft} />
        <Stat label="Awaiting check" value={totals.submitted} tone="info" />
        <Stat label="Verified" value={totals.verified} tone="good" />
      </div>

      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-3 font-semibold text-slate-900">By college</h2>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">
              Exam form progress for each affiliated college
            </caption>
            <thead>
              <tr className="border-b border-slate-200 text-xs tracking-wide text-slate-500 uppercase">
                <th scope="col" className="py-2 pr-4 font-medium">
                  College
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">
                  Students
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">
                  Not started
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">
                  Draft
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">
                  Awaiting
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">
                  Verified
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">
                  Sent back
                </th>
                <th scope="col" className="py-2 font-medium">
                  Progress
                </th>
              </tr>
            </thead>
            <tbody>
              {byCollege.map((college) => (
                <CollegeRow key={college.collegeId} college={college} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {bySemester.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="mb-3 font-semibold text-slate-900">By semester</h2>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <caption className="sr-only">
                Exam form progress for each semester, across all colleges
              </caption>
              <thead>
                <tr className="border-b border-slate-200 text-xs tracking-wide text-slate-500 uppercase">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Semester
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">
                    Draft
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">
                    Awaiting
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">
                    Verified
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Sent back
                  </th>
                </tr>
              </thead>
              <tbody>
                {bySemester.map((row) => (
                  <tr
                    key={row.semester}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <th scope="row" className="py-2 pr-4 font-medium text-slate-900">
                      Semester {row.semester}
                    </th>
                    <td className="py-2 pr-4 text-right text-slate-600">{row.draft}</td>
                    <td className="py-2 pr-4 text-right text-slate-600">
                      {row.submitted}
                    </td>
                    <td className="py-2 pr-4 text-right text-slate-600">
                      {row.verified}
                    </td>
                    <td className="py-2 text-right text-slate-600">{row.rejected}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function CollegeRow({ college }: { college: CollegeStatistics }) {
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <th scope="row" className="py-2.5 pr-4 font-normal">
        <span className="block font-medium text-slate-900">{college.collegeName}</span>
        <span className="text-xs text-slate-500">
          {college.collegeCode}
          {!college.isActive && ' · deactivated'}
        </span>
      </th>
      <td className="py-2.5 pr-4 text-right text-slate-600">{college.students}</td>
      <td
        className={`py-2.5 pr-4 text-right ${
          college.notStarted > 0 ? 'font-medium text-amber-800' : 'text-slate-400'
        }`}
      >
        {college.notStarted}
      </td>
      <td className="py-2.5 pr-4 text-right text-slate-600">{college.draft}</td>
      <td className="py-2.5 pr-4 text-right text-slate-600">{college.submitted}</td>
      <td className="py-2.5 pr-4 text-right font-medium text-emerald-800">
        {college.verified}
      </td>
      <td className="py-2.5 pr-4 text-right text-slate-600">{college.rejected}</td>
      <td className="py-2.5">
        <ProgressBar percent={college.completionRate} />
      </td>
    </tr>
  );
}

/**
 * A percentage bar with the number beside it.
 *
 * The figure is written out as text as well as drawn, so it is readable without relying
 * on colour or on being able to judge a bar's length.
 */
function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="flex min-w-28 items-center gap-2">
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"
        role="img"
        aria-label={`${percent}% verified`}
      >
        <div
          className="h-full rounded-full bg-emerald-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="w-9 text-right text-xs text-slate-600">{percent}%</span>
    </div>
  );
}

const TONE_CLASSES = {
  plain: 'text-slate-900',
  good: 'text-emerald-700',
  warn: 'text-amber-700',
  info: 'text-brand-700',
} as const;

function Stat({
  label,
  value,
  tone = 'plain',
}: {
  label: string;
  value: number;
  tone?: keyof typeof TONE_CLASSES;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs tracking-wide text-slate-500 uppercase">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${TONE_CLASSES[tone]}`}>{value}</p>
    </div>
  );
}
