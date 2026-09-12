import { useState } from 'react';
import {
  EXAM_FORM_STATUS_LABELS,
  ExamFormStatus,
  SUBJECT_TYPE_LABELS,
  SubmissionBlock,
  isEditableStatus,
  yearLabelFor,
  type MyExamFormResponse,
} from '@ues/shared';
import { useMyExamForm, useSaveDraft, useSubmitForm } from '@/api/exam-forms';
import { useAuth } from '@/hooks/use-auth';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { NO_ERRORS, toFormErrors, type FormErrors } from '@/lib/form-errors';
import { PrintableExamForm } from './PrintableExamForm';

/**
 * Explains why a student cannot register, in words that name a next step.
 *
 * The server sends a specific reason rather than a bare false, because "your college has
 * not published subjects yet" and "registration closed on Friday" call for different
 * actions by different people.
 */
function blockMessage(data: MyExamFormResponse): { title: string; body: string } | null {
  const closesOn = data.window ? new Date(data.window.closeAt).toLocaleDateString() : '';
  const opensOn = data.window ? new Date(data.window.openAt).toLocaleDateString() : '';

  switch (data.block) {
    case SubmissionBlock.NoOffering:
    case SubmissionBlock.NoSubjects:
      return {
        title: 'Your college has not published subjects yet',
        body: 'Faculty choose which subjects this college runs each semester. Your form will open once they have.',
      };
    case SubmissionBlock.NoWindow:
      return {
        title: 'Registration has not been scheduled',
        body: 'The university sets the registration dates for each semester. Nothing has been scheduled for yours yet.',
      };
    case SubmissionBlock.WindowNotOpen:
      return data.window?.status === 'closed'
        ? {
            title: 'Registration has closed',
            body: `The window for semester ${data.semester} closed on ${closesOn}. Contact your college office if you have not registered.`,
          }
        : {
            title: 'Registration is not open yet',
            body: `The window for semester ${data.semester} opens on ${opensOn}.`,
          };
    case SubmissionBlock.AlreadySubmitted:
      return null;
    default:
      return null;
  }
}

export default function ExamFormPage() {
  const { user } = useAuth();
  const { data, isPending, isError } = useMyExamForm();

  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const saveDraft = useSaveDraft();
  const submitForm = useSubmitForm();

  if (isPending) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-20 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset">
        Could not load your exam form.
      </p>
    );
  }

  const { form, availableSubjects, window: examWindow, canEdit } = data;
  const isLocked = Boolean(form && !isEditableStatus(form.status));

  // The selection starts from the saved form and is only tracked locally once the
  // student touches it, so a background refetch cannot overwrite work in progress.
  const chosen = selected ?? new Set(form?.subjects.map((subject) => subject.id) ?? []);

  const toggle = (id: string) => {
    setSavedAt(null);
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const totalCredits = availableSubjects
    .filter((subject) => chosen.has(subject.id))
    .reduce((sum, subject) => sum + subject.credits, 0);

  const run = async (action: 'draft' | 'submit') => {
    setErrors(NO_ERRORS);
    setSavedAt(null);

    if (action === 'submit') {
      const confirmed = window.confirm(
        `Submit ${chosen.size} subject${chosen.size === 1 ? '' : 's'} for semester ${data.semester}?\n\nOnce submitted the form is locked and only your college office can reopen it.`,
      );
      if (!confirmed) return;
    }

    try {
      const ids = [...chosen];
      if (action === 'draft') {
        await saveDraft.mutateAsync(ids);
        setSavedAt(new Date().toLocaleTimeString());
      } else {
        await submitForm.mutateAsync(ids);
      }
      setSelected(null);
    } catch (error) {
      setErrors(toFormErrors(error));
    }
  };

  const block = blockMessage(data);
  const isBusy = saveDraft.isPending || submitForm.isPending;

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Exam form"
          subtitle={`Semester ${data.semester}${
            user?.studentProfile
              ? ` · ${yearLabelFor(data.semester, user.studentProfile.programType)}`
              : ''
          }${data.academicYear ? ` · ${data.academicYear}` : ''}`}
          action={
            isLocked ? (
              <Button onClick={() => window.print()}>Print form</Button>
            ) : undefined
          }
        />

        {form?.status === ExamFormStatus.Rejected && form.rejectionReason && (
          <div className="mb-5 rounded-xl bg-rose-50 p-4 ring-1 ring-rose-200 ring-inset">
            <h2 className="font-semibold text-rose-900">
              Your form was sent back for correction
            </h2>
            <p className="mt-1 text-sm text-rose-800">{form.rejectionReason}</p>
            <p className="mt-2 text-sm text-rose-800">
              Make the change below and submit again. Your form number stays the same.
            </p>
          </div>
        )}

        {isLocked && form && (
          <div className="mb-5 rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200 ring-inset">
            <h2 className="font-semibold text-emerald-900">
              {EXAM_FORM_STATUS_LABELS[form.status]}
            </h2>
            <p className="mt-1 text-sm text-emerald-800">
              Form number <span className="font-mono">{form.formNumber}</span>. Print a
              copy and submit it to your college office.
            </p>
          </div>
        )}

        {block && (
          <div className="mb-5 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200 ring-inset">
            <h2 className="font-semibold text-amber-900">{block.title}</h2>
            <p className="mt-1 text-sm text-amber-800">{block.body}</p>
          </div>
        )}

        {examWindow?.isOpenNow && !isLocked && (
          <p className="mb-4 text-sm text-slate-600">
            Registration closes on{' '}
            <span className="font-medium text-slate-900">
              {new Date(examWindow.closeAt).toLocaleString()}
            </span>
            .
          </p>
        )}

        {!isLocked && availableSubjects.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-slate-900">Choose your subjects</h2>
                <p className="text-sm text-slate-600">
                  {chosen.size} of {availableSubjects.length} selected · {totalCredits}{' '}
                  credits
                </p>
              </div>

              <div className="flex items-center gap-2">
                {savedAt && (
                  <span
                    role="status"
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                  >
                    Draft saved at {savedAt}
                  </span>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void run('draft')}
                  disabled={isBusy}
                >
                  Save draft
                </Button>
                <Button
                  size="sm"
                  onClick={() => void run('submit')}
                  disabled={isBusy || chosen.size === 0 || !canEdit}
                >
                  {submitForm.isPending ? 'Submitting…' : 'Submit form'}
                </Button>
              </div>
            </div>

            <ul className="space-y-1.5">
              {availableSubjects.map((subject) => {
                const isSelected = chosen.has(subject.id);

                return (
                  <li key={subject.id}>
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 transition ${
                        isSelected
                          ? 'border-brand-400 bg-brand-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(subject.id)}
                        className="mt-0.5 size-4 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-200"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-slate-900">
                          <span className="font-mono text-slate-600">{subject.code}</span>{' '}
                          {subject.name}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {SUBJECT_TYPE_LABELS[subject.subjectType]} · {subject.credits}{' '}
                          credit{subject.credits === 1 ? '' : 's'}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            {errors.message && (
              <p
                role="alert"
                className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset"
              >
                {errors.message}
              </p>
            )}
          </section>
        )}
      </div>

      {/* The printable document. On screen it is the read-only view of a locked form;
          on paper it is the whole page, since everything above is `no-print`. */}
      {form && isLocked && (
        <div className="mt-5 rounded-xl border border-slate-200 print:mt-0 print:rounded-none print:border-0">
          <PrintableExamForm form={form} />
        </div>
      )}
    </>
  );
}
