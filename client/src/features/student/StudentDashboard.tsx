import { Link } from 'react-router-dom';
import { EXAM_FORM_STATUS_LABELS, EntryType, yearLabelFor } from '@ues/shared';
import { useAuth } from '@/hooks/use-auth';
import { useMyExamForm } from '@/api/exam-forms';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { paths } from '@/routes/paths';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-2.5 last:border-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const profile = user?.studentProfile;
  const { data: examForm } = useMyExamForm();

  return (
    <>
      <PageHeader
        title={`Welcome, ${user?.firstName ?? 'student'}`}
        subtitle={user?.college?.name ?? undefined}
      />

      {/* The one thing a student comes here to find out: can I register, and have I. */}
      {examForm && (
        <div
          className={`mb-5 rounded-xl p-4 ring-1 ring-inset ${
            examForm.form && !examForm.canEdit
              ? 'bg-emerald-50 ring-emerald-200'
              : examForm.canSubmit
                ? 'bg-brand-50 ring-brand-200'
                : 'bg-slate-50 ring-slate-200'
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">
                Semester {examForm.semester} exam form
              </h2>
              <p className="mt-1 text-sm text-slate-700">
                {examForm.form
                  ? `${EXAM_FORM_STATUS_LABELS[examForm.form.status]}${
                      examForm.form.formNumber ? ` · ${examForm.form.formNumber}` : ''
                    }`
                  : examForm.canSubmit
                    ? 'Registration is open. You have not filled your form yet.'
                    : 'Not available to fill yet.'}
              </p>
            </div>

            <Link to={paths.studentExamForm}>
              <Button size="sm">
                {examForm.form && !examForm.canEdit ? 'View and print' : 'Open form'}
              </Button>
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <h2 className="font-semibold text-slate-900">Your details</h2>

          {profile ? (
            <dl className="mt-3">
              <DetailRow label="Roll number" value={profile.rollNumber || '—'} />
              <DetailRow label="Programme" value={profile.programType} />
              <DetailRow
                label="Current semester"
                value={`Semester ${profile.currentSemester} · ${yearLabelFor(
                  profile.currentSemester,
                  profile.programType,
                )}`}
              />
              <DetailRow
                label="Admission type"
                value={
                  profile.entryType === EntryType.Lateral
                    ? 'Direct Second Year (lateral entry)'
                    : 'Regular'
                }
              />
              <DetailRow
                label="Stream"
                value={profile.streamName ?? 'Not assigned yet'}
              />
            </dl>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No student profile on record.</p>
          )}

          {profile?.entryType === EntryType.Lateral && (
            <p className="mt-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-900 ring-1 ring-brand-200 ring-inset">
              As a Direct Second Year student you began at semester 3, so semesters 1 and
              2 do not apply to you. Your exam forms will only ever offer semesters 3 to
              8.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Something wrong?</h2>
          <p className="mt-2 text-sm text-slate-600">
            Your name, date of birth and photograph appear on your marksheet, so they are
            corrected at the college office rather than edited here.
          </p>
          <Link
            to={paths.studentCorrections}
            className="mt-3 inline-block text-sm font-medium text-brand-700 underline underline-offset-2"
          >
            Request a correction
          </Link>
        </section>
      </div>
    </>
  );
}
