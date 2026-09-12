import { useId, useState, type FormEvent } from 'react';
import type { ExamFormSummary } from '@ues/shared';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { NO_ERRORS, toFormErrors, type FormErrors } from '@/lib/form-errors';
import { useRejectForm } from '@/api/verification';

const MINIMUM_REASON = 10;

/**
 * Sends a form back to the student with a reason.
 *
 * The reason box is the entire dialog, deliberately. The student is the only person who
 * can fix the form, so a rejection without a usable explanation just costs them a trip
 * to the office to ask what was wrong. The server enforces the same minimum length.
 */
export function RejectFormModal({
  form,
  onClose,
}: {
  form: ExamFormSummary;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const rejectForm = useRejectForm();

  const fieldId = useId();
  const tooShort = reason.trim().length < MINIMUM_REASON;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);

    try {
      await rejectForm.mutateAsync({ id: form.id, reason: reason.trim() });
      onClose();
    } catch (error) {
      setErrors(toFormErrors(error));
    }
  };

  return (
    <Modal onClose={onClose} title="Send this form back">
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-900">{form.studentName}</p>
          <p className="text-slate-600">
            {form.rollNumber} · Semester {form.semester} ·{' '}
            <span className="font-mono">{form.formNumber}</span>
          </p>
        </div>

        <div>
          <label htmlFor={fieldId} className="block text-sm font-medium text-slate-700">
            What does the student need to correct?
            <span aria-hidden="true" className="ml-0.5 text-rose-600">
              *
            </span>
          </label>

          <textarea
            id={fieldId}
            required
            rows={4}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-invalid={errors.fields.reason ? true : undefined}
            placeholder="For example: the date of birth on your form does not match your birth certificate."
            className={`mt-1 w-full rounded-lg border px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 ${
              errors.fields.reason
                ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                : 'border-slate-300 focus:border-brand-600 focus:ring-brand-200'
            }`}
          />

          <p className="mt-1 text-xs text-slate-500">
            The student sees this on their form. Be specific enough that they can fix it
            without coming to ask.
          </p>

          {errors.fields.reason && (
            <p className="mt-1 text-xs text-rose-700">
              {errors.fields.reason.join('. ')}
            </p>
          )}
        </div>

        {errors.message && (
          <p
            role="alert"
            className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset"
          >
            {errors.message}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={rejectForm.isPending}>
            Cancel
          </Button>
          <button
            type="submit"
            disabled={rejectForm.isPending || tooShort}
            className="rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {rejectForm.isPending ? 'Sending back…' : 'Send back'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
