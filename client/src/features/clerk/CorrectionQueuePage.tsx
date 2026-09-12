import { useState } from 'react';
import {
  CORRECTABLE_FIELD_LABELS,
  CORRECTION_STATUS_LABELS,
  CorrectionStatus,
  type CorrectableField,
  type CorrectionRequestDetail,
} from '@ues/shared';
import { useApproveCorrection, useCorrectionQueue } from '@/api/corrections';
import { ApiError } from '@/api/client';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { DeclineCorrectionModal } from './DeclineCorrectionModal';

const STATUS_STYLES: Record<CorrectionStatus, string> = {
  pending: 'bg-amber-100 text-amber-900',
  approved: 'bg-emerald-100 text-emerald-900',
  rejected: 'bg-rose-100 text-rose-900',
};

const TABS = [
  { value: CorrectionStatus.Pending, label: 'Awaiting documents' },
  { value: CorrectionStatus.Approved, label: 'Approved' },
  { value: CorrectionStatus.Rejected, label: 'Declined' },
  { value: '', label: 'All' },
];

/**
 * The clerk's correction desk.
 *
 * Each ticket shows the current value beside the requested one, so the decision can be
 * made from this screen against the documents on the counter, without looking the
 * student up separately.
 */
export default function CorrectionQueuePage() {
  const [status, setStatus] = useState<string>(CorrectionStatus.Pending);
  const [declining, setDeclining] = useState<CorrectionRequestDetail | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: tickets, isPending, isError } = useCorrectionQueue(status || undefined);
  const approveCorrection = useApproveCorrection();

  const approve = async (ticket: CorrectionRequestDetail) => {
    setActionError(null);

    const changes = Object.keys(ticket.requested)
      .map((field) => CORRECTABLE_FIELD_LABELS[field as CorrectableField])
      .join(', ');

    const confirmed = window.confirm(
      `Approve ticket ${ticket.ticketNumber} for ${ticket.studentName}?\n\nThis will change: ${changes}.\n\nOnly do this once you have seen the documents.`,
    );
    if (!confirmed) return;

    try {
      await approveCorrection.mutateAsync(ticket.id);
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Could not approve.');
    }
  };

  return (
    <>
      <PageHeader
        title="Correction requests"
        subtitle="Check the student's documents before approving. Approving rewrites their record."
      />

      {actionError && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset"
        >
          {actionError}
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-1">
        {TABS.map((tab) => (
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
          </button>
        ))}
      </div>

      {isPending && (
        <div className="space-y-2" aria-busy="true">
          {[0, 1].map((row) => (
            <div key={row} className="h-28 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      )}

      {isError && (
        <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset">
          Could not load correction requests.
        </p>
      )}

      {tickets && tickets.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-medium text-slate-900">
            {status === CorrectionStatus.Pending
              ? 'Nothing waiting'
              : 'No requests match'}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {status === CorrectionStatus.Pending
              ? 'Requests appear here as students raise them.'
              : 'Try a different tab.'}
          </p>
        </div>
      )}

      {tickets && tickets.length > 0 && (
        <ul className="space-y-2">
          {tickets.map((ticket) => (
            <li
              key={ticket.id}
              className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900">{ticket.studentName}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[ticket.status]}`}
                    >
                      {CORRECTION_STATUS_LABELS[ticket.status]}
                    </span>
                  </div>

                  <p className="mt-0.5 text-xs text-slate-500">
                    {ticket.rollNumber} ·{' '}
                    <span className="font-mono">{ticket.ticketNumber}</span> · raised{' '}
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {ticket.status === CorrectionStatus.Pending && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => void approve(ticket)}
                      disabled={approveCorrection.isPending}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setDeclining(ticket)}
                    >
                      Decline
                    </Button>
                  </div>
                )}
              </div>

              <ChangeTable ticket={ticket} />

              {ticket.status === CorrectionStatus.Pending &&
                ticket.requiredDocuments.length > 0 && (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      Documents to check
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {ticket.requiredDocuments.map((document) => (
                        <li key={document} className="flex gap-2 text-sm text-slate-700">
                          <span
                            aria-hidden="true"
                            className="mt-2 size-1.5 shrink-0 rounded-full bg-slate-400"
                          />
                          {document}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              {ticket.reason && (
                <p className="mt-3 rounded-lg bg-rose-50 p-2.5 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset">
                  Declined: {ticket.reason}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {declining && (
        <DeclineCorrectionModal ticket={declining} onClose={() => setDeclining(null)} />
      )}
    </>
  );
}

/** Current value beside requested value, so the decision needs no second lookup. */
function ChangeTable({ ticket }: { ticket: CorrectionRequestDetail }) {
  const fields = Object.keys(ticket.requested) as CorrectableField[];

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[26rem] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs tracking-wide text-slate-500 uppercase">
            <th scope="col" className="py-1.5 pr-4 font-medium">
              Field
            </th>
            <th scope="col" className="py-1.5 pr-4 font-medium">
              Currently
            </th>
            <th scope="col" className="py-1.5 font-medium">
              Requested
            </th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field} className="border-b border-slate-100 last:border-0">
              <td className="py-2 pr-4 text-slate-600">
                {CORRECTABLE_FIELD_LABELS[field]}
              </td>

              {field === 'photoUrl' ? (
                <>
                  <td className="py-2 pr-4">
                    <PhotoCell url={ticket.current.photoUrl} />
                  </td>
                  <td className="py-2">
                    <PhotoCell url={ticket.requested.photoUrl} />
                  </td>
                </>
              ) : (
                <>
                  <td className="py-2 pr-4 text-slate-500">
                    {ticket.current[field] || '(blank)'}
                  </td>
                  <td className="py-2 font-medium text-slate-900">
                    {ticket.requested[field] || '(blank)'}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PhotoCell({ url }: { url?: string }) {
  if (!url) return <span className="text-slate-400">None</span>;

  return (
    <img
      src={url}
      alt=""
      // Sized down here as well as on the host, so a large original never pushes the
      // table around while it loads.
      className="size-16 rounded border border-slate-200 object-cover"
      loading="lazy"
    />
  );
}
