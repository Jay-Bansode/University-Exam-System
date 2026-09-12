import { useState, type FormEvent } from 'react';
import {
  CORRECTABLE_FIELD_LABELS,
  CORRECTION_STATUS_LABELS,
  CorrectionStatus,
  type CorrectableField,
  type CorrectionRequestDetail,
} from '@ues/shared';
import {
  useCreateCorrectionRequest,
  useMyCorrectionRequests,
  useUploadSignature,
  uploadPhoto,
} from '@/api/corrections';
import { useAuth } from '@/hooks/use-auth';
import { PageHeader } from '@/components/PageHeader';
import { FormField } from '@/components/FormField';
import { NO_ERRORS, toFormErrors, type FormErrors } from '@/lib/form-errors';

const STATUS_STYLES: Record<CorrectionStatus, string> = {
  pending: 'bg-amber-100 text-amber-900',
  approved: 'bg-emerald-100 text-emerald-900',
  rejected: 'bg-rose-100 text-rose-900',
};

/**
 * Where a student asks to correct their name, date of birth or photograph.
 *
 * These fields are not editable directly because they appear on a marksheet, so changing
 * one is an administrative act backed by documents. The page says that plainly rather
 * than presenting a form that silently goes nowhere.
 */
export default function CorrectionsPage() {
  const { user } = useAuth();
  const profile = user?.studentProfile;

  const { data: tickets, isPending } = useMyCorrectionRequests();
  const { data: uploads } = useUploadSignature();
  const createRequest = useCreateCorrectionRequest();

  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [middleName, setMiddleName] = useState(user?.middleName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [isUploading, setIsUploading] = useState(false);

  const openTicket = tickets?.find(
    (ticket) => ticket.status === CorrectionStatus.Pending,
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);

    try {
      let photoUrl: string | undefined;

      if (photoFile && uploads?.signature) {
        setIsUploading(true);
        photoUrl = await uploadPhoto(photoFile, uploads.signature);
        setIsUploading(false);
      }

      // Only fields the student actually touched are sent. The server compares against
      // the stored values anyway and drops anything unchanged.
      await createRequest.mutateAsync({
        ...(firstName.trim() !== (user?.firstName ?? '')
          ? { firstName: firstName.trim() }
          : {}),
        ...(middleName.trim() !== (user?.middleName ?? '')
          ? { middleName: middleName.trim() }
          : {}),
        ...(lastName.trim() !== (user?.lastName ?? '')
          ? { lastName: lastName.trim() }
          : {}),
        ...(dateOfBirth ? { dateOfBirth } : {}),
        ...(photoUrl ? { photoUrl } : {}),
      });

      setDateOfBirth('');
      setPhotoFile(null);
    } catch (error) {
      setIsUploading(false);
      setErrors(toFormErrors(error));
    }
  };

  const isBusy = createRequest.isPending || isUploading;

  return (
    <>
      <PageHeader
        title="Correct your details"
        subtitle="Your name, date of birth and photograph appear on your marksheet, so changes are checked at the college office."
      />

      {openTicket && <OpenTicketPanel ticket={openTicket} />}

      {!openTicket && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="font-semibold text-slate-900">Request a correction</h2>
          <p className="mt-1 mb-4 text-sm text-slate-600">
            Change only what is wrong. You will be given a ticket number and told which
            documents to bring in.
          </p>

          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="First name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                errors={errors.fields.firstName}
              />
              <FormField
                label="Last name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                errors={errors.fields.lastName}
              />
            </div>

            <FormField
              label="Middle name"
              value={middleName}
              onChange={(event) => setMiddleName(event.target.value)}
              errors={errors.fields.middleName}
              hint="Leave blank if you do not have one."
            />

            <FormField
              label="Date of birth"
              type="date"
              value={dateOfBirth}
              onChange={(event) => setDateOfBirth(event.target.value)}
              errors={errors.fields.dateOfBirth}
              hint={
                profile
                  ? 'Fill this in only if your recorded date of birth is wrong.'
                  : undefined
              }
            />

            {uploads?.configured ? (
              <div>
                <label
                  htmlFor="photo"
                  className="block text-sm font-medium text-slate-700"
                >
                  Replacement photograph
                </label>
                <input
                  id="photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
                />
                <p className="mt-1 text-xs text-slate-500">
                  A recent passport-style photograph. Uploaded directly to our image host,
                  not through this form.
                </p>
              </div>
            ) : (
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                Photograph uploads are not enabled on this deployment. Name and
                date-of-birth corrections still work.
              </p>
            )}

            {errors.message && (
              <p
                role="alert"
                className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset"
              >
                {errors.message}
              </p>
            )}

            <button
              type="submit"
              disabled={isBusy}
              className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {isUploading
                ? 'Uploading photograph…'
                : createRequest.isPending
                  ? 'Submitting…'
                  : 'Raise a request'}
            </button>
          </form>
        </section>
      )}

      <section className="mt-5">
        <h2 className="mb-3 font-semibold text-slate-900">Your requests</h2>

        {isPending && (
          <div className="h-20 animate-pulse rounded-xl bg-slate-100" aria-busy="true" />
        )}

        {tickets && tickets.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
            You have not raised any correction requests.
          </p>
        )}

        {tickets && tickets.length > 0 && (
          <ul className="space-y-2">
            {tickets.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/**
 * The instruction the original requirement asked for: once a ticket exists, tell the
 * student exactly which documents to take to the office.
 */
function OpenTicketPanel({ ticket }: { ticket: CorrectionRequestDetail }) {
  return (
    <div className="mb-5 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200 ring-inset">
      <h2 className="font-semibold text-amber-900">
        Request raised · ticket <span className="font-mono">{ticket.ticketNumber}</span>
      </h2>

      <p className="mt-2 text-sm text-amber-900">
        Please bring the following to the college office. Your request will be reviewed
        once the documents are checked.
      </p>

      <ul className="mt-2 space-y-1">
        {ticket.requiredDocuments.map((document) => (
          <li key={document} className="flex gap-2 text-sm text-amber-900">
            <span
              aria-hidden="true"
              className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-500"
            />
            {document}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-amber-800">
        You can raise another request once this one has been reviewed.
      </p>
    </div>
  );
}

function TicketRow({ ticket }: { ticket: CorrectionRequestDetail }) {
  const fields = Object.keys(ticket.requested) as CorrectableField[];

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-sm font-medium text-slate-900">
            {ticket.ticketNumber}
          </p>
          <p className="text-xs text-slate-500">
            Raised {new Date(ticket.createdAt).toLocaleDateString()}
          </p>
        </div>

        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[ticket.status]}`}
        >
          {CORRECTION_STATUS_LABELS[ticket.status]}
        </span>
      </div>

      <dl className="mt-3 space-y-1 text-sm">
        {fields.map((field) => (
          <div key={field} className="flex flex-wrap gap-x-2">
            <dt className="text-slate-500">{CORRECTABLE_FIELD_LABELS[field]}</dt>
            <dd className="text-slate-900">
              {field === 'photoUrl' ? (
                'New photograph'
              ) : (
                <>
                  <span className="text-slate-500 line-through">
                    {ticket.current[field] || '(blank)'}
                  </span>{' '}
                  <span aria-hidden="true">→</span>{' '}
                  <span className="font-medium">
                    {ticket.requested[field] || '(blank)'}
                  </span>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {ticket.reason && (
        <p className="mt-3 rounded-lg bg-rose-50 p-2.5 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset">
          Declined: {ticket.reason}
        </p>
      )}
    </li>
  );
}
