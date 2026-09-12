import { useState } from 'react';
import {
  EXAM_FORM_STATUS_LABELS,
  ExamFormStatus,
  type ExamFormSummary,
  type VerificationCounts,
} from '@ues/shared';
import { useVerificationQueue, useVerifyForm } from '@/api/verification';
import { ApiError } from '@/api/client';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { RejectFormModal } from './RejectFormModal';

const STATUS_STYLES: Record<ExamFormStatus, string> = {
  submitted: 'bg-amber-100 text-amber-900',
  verified: 'bg-emerald-100 text-emerald-900',
  rejected: 'bg-rose-100 text-rose-900',
  draft: 'bg-slate-200 text-slate-700',
};

const TABS: {
  value: string;
  label: string;
  countKey: keyof VerificationCounts | null;
}[] = [
  {
    value: ExamFormStatus.Submitted,
    label: 'Awaiting verification',
    countKey: 'submitted',
  },
  { value: ExamFormStatus.Rejected, label: 'Sent back', countKey: 'rejected' },
  { value: ExamFormStatus.Verified, label: 'Verified', countKey: 'verified' },
  { value: '', label: 'All', countKey: null },
];

/**
 * The clerk's desk.
 *
 * Defaults to the submitted queue rather than to everything, because that is the only
 * tab with work in it. The counts come back with the list, so switching tabs does not
 * cost a second request.
 */
export default function VerificationPage() {
  const [status, setStatus] = useState<string>(ExamFormStatus.Submitted);
  const [search, setSearch] = useState('');
  const [rejecting, setRejecting] = useState<ExamFormSummary | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isPending, isError } = useVerificationQueue({ status, search });
  const verifyForm = useVerifyForm();

  const verify = async (form: ExamFormSummary) => {
    setActionError(null);

    const confirmed = window.confirm(
      `Verify ${form.studentName}'s form for semester ${form.semester}?\n\nVerification is final. A problem found afterwards has to go through a correction request.`,
    );
    if (!confirmed) return;

    try {
      await verifyForm.mutateAsync(form.id);
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Could not verify.');
    }
  };

  return (
    <>
      <PageHeader
        title="Exam form verification"
        subtitle="Check a submitted form against the documents the student brings to the office."
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
          {TABS.map((tab) => {
            const count = tab.countKey ? data?.counts[tab.countKey] : undefined;

            return (
              <button
                key={tab.value || 'all'}
                type="button"
                onClick={() => setStatus(tab.value)}
                aria-pressed={status === tab.value}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  status === tab.value
                    ? 'bg-brand-600 text-white'
                    : 'bg-white text-slate-700 ring-1 ring-slate-200 ring-inset hover:bg-slate-50'
                }`}
              >
                {tab.label}
                {count !== undefined && count > 0 && (
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
                      status === tab.value ? 'bg-white/20' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <label htmlFor="form-search" className="sr-only">
          Search by student name or roll number
        </label>
        <input
          id="form-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or roll number"
          className="min-w-48 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none"
        />
      </div>

      {isPending && (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      )}

      {isError && (
        <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset">
          Could not load the queue.
        </p>
      )}

      {data && data.forms.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-medium text-slate-900">
            {status === ExamFormStatus.Submitted ? 'Nothing waiting' : 'No forms match'}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {status === ExamFormStatus.Submitted
              ? 'Submitted forms appear here as students hand them in.'
              : 'Try a different tab or search.'}
          </p>
        </div>
      )}

      {data && data.forms.length > 0 && (
        <ul className="space-y-2">
          {data.forms.map((form) => (
            <li
              key={form.id}
              className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900">{form.studentName}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[form.status]}`}
                    >
                      {EXAM_FORM_STATUS_LABELS[form.status]}
                    </span>
                  </div>

                  <p className="mt-0.5 text-sm text-slate-600">
                    {form.rollNumber} · {form.streamName} · Semester {form.semester} ·{' '}
                    {form.academicYear}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    <span className="font-mono">{form.formNumber ?? 'No number'}</span> ·{' '}
                    {form.subjectCount} subject{form.subjectCount === 1 ? '' : 's'} ·{' '}
                    {form.totalCredits} credits
                    {form.submittedAt &&
                      ` · submitted ${new Date(form.submittedAt).toLocaleDateString()}`}
                  </p>

                  {form.rejectionReason && (
                    <p className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-900 ring-1 ring-rose-200 ring-inset">
                      Sent back: {form.rejectionReason}
                    </p>
                  )}
                </div>

                {form.status === ExamFormStatus.Submitted && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => void verify(form)}
                      disabled={verifyForm.isPending}
                    >
                      Verify
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setRejecting(form)}
                    >
                      Send back
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {rejecting && (
        <RejectFormModal form={rejecting} onClose={() => setRejecting(null)} />
      )}
    </>
  );
}
