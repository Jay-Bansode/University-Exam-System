import { useId, useState, type FormEvent } from 'react';
import type { CorrectionRequestDetail } from '@ues/shared';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { NO_ERRORS, toFormErrors, type FormErrors } from '@/lib/form-errors';
import { useDeclineCorrection } from '@/api/corrections';

const MINIMUM_REASON = 10;

/**
 * Declines a correction ticket with a reason.
 *
 * Same shape and same rule as the exam-form rejection dialog: the student is the only
 * person who can act on it, so "declined" alone just sends them back to the office to
 * ask what was missing.
 */
export function DeclineCorrectionModal({
  ticket,
  onClose,
}: {
  ticket: CorrectionRequestDetail;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const declineCorrection = useDeclineCorrection();

  const fieldId = useId();
  const tooShort = reason.trim().length < MINIMUM_REASON;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);

    try {
      await declineCorrection.mutateAsync({ id: ticket.id, reason: reason.trim() });
      onClose();
    } catch (error) {
      setErrors(toFormErrors(error));
    }
  };

  return (
    <Modal onClose={onClose} title="Decline this request">
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-900">{ticket.studentName}</p>
          <p className="text-slate-600">
            {ticket.rollNumber} · <span className="font-mono">{ticket.ticketNumber}</span>
          </p>
        </div>

        <div>
          <label htmlFor={fieldId} className="block text-sm font-medium text-slate-700">
            Why is this being declined?
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
            placeholder="For example: the birth certificate you brought shows a different spelling."
            className={`mt-1 w-full rounded-lg border px-3 py-2 text-slate-900 focus:ring-2 focus:outline-none ${
              errors.fields.reason
                ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                : 'border-slate-300 focus:border-brand-600 focus:ring-brand-200'
            }`}
          />

          <p className="mt-1 text-xs text-slate-500">
            The student reads this. Be specific enough that they know what to bring next
            time.
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
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={declineCorrection.isPending}
          >
            Cancel
          </Button>
          <button
            type="submit"
            disabled={declineCorrection.isPending || tooShort}
            className="rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {declineCorrection.isPending ? 'Declining…' : 'Decline'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
