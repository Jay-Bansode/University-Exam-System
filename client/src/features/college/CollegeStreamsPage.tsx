import { useState } from 'react';
import type { CollegeStreamDetail } from '@ues/shared';
import { useStreams } from '@/api/syllabus';
import {
  useAddCollegeStream,
  useCollegeStreams,
  useRemoveCollegeStream,
} from '@/api/enrolment';
import { ApiError } from '@/api/client';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { SelectField } from '@/components/SelectField';

/**
 * Which of the university's streams this college teaches.
 *
 * The catalogue on offer comes from the university and cannot be added to here — a
 * college chooses from what exists, which is the same rule faculty will meet with
 * subjects in Phase 5.
 */
export default function CollegeStreamsPage() {
  const { data: offered, isPending, isError } = useCollegeStreams();
  const { data: allStreams } = useStreams();

  const [addOpen, setAddOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const removeStream = useRemoveCollegeStream();

  // Only streams the university offers and this college has not already taken.
  const available = (allStreams ?? []).filter(
    (stream) =>
      stream.isActive && !(offered ?? []).some((entry) => entry.streamId === stream.id),
  );

  const remove = async (entry: CollegeStreamDetail) => {
    setActionError(null);

    const confirmed = window.confirm(
      `Stop offering ${entry.streamName} at this college?`,
    );
    if (!confirmed) return;

    try {
      await removeStream.mutateAsync(entry.id);
    } catch (error) {
      // The API refuses while students are enrolled, and says how many.
      setActionError(error instanceof ApiError ? error.message : 'Could not remove.');
    }
  };

  return (
    <>
      <PageHeader
        title="Streams offered"
        subtitle="Chosen from the university's published branches. Students are enrolled into these."
        action={
          <Button onClick={() => setAddOpen(true)} disabled={available.length === 0}>
            Offer a stream
          </Button>
        }
      />

      {actionError && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset"
        >
          {actionError}
        </p>
      )}

      {isPending && (
        <div className="space-y-2" aria-busy="true">
          {[0, 1].map((row) => (
            <div key={row} className="h-16 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      )}

      {isError && (
        <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset">
          Could not load streams.
        </p>
      )}

      {offered && offered.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-medium text-slate-900">No streams offered yet</p>
          <p className="mt-1 text-sm text-slate-600">
            Add at least one before enrolling students.
          </p>
        </div>
      )}

      {offered && offered.length > 0 && (
        <ul className="space-y-2">
          {offered.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-slate-900">{entry.streamName}</p>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                    {entry.streamCode}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-slate-600">
                  {entry.programType} · {entry.totalSemesters} semesters ·{' '}
                  {entry.studentCount} student{entry.studentCount === 1 ? '' : 's'}
                </p>
              </div>

              <Button
                size="sm"
                variant={entry.studentCount === 0 ? 'danger' : 'secondary'}
                onClick={() => void remove(entry)}
                disabled={removeStream.isPending}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {addOpen && (
        <AddStreamModal
          onClose={() => setAddOpen(false)}
          available={available.map((stream) => ({
            value: stream.id,
            label: `${stream.name} (${stream.programType})`,
          }))}
        />
      )}
    </>
  );
}

function AddStreamModal({
  onClose,
  available,
}: {
  onClose: () => void;
  available: { value: string; label: string }[];
}) {
  const [streamId, setStreamId] = useState(available[0]?.value ?? '');
  const [error, setError] = useState<string | null>(null);

  const addStream = useAddCollegeStream();

  const submit = async () => {
    setError(null);
    try {
      await addStream.mutateAsync({ streamId });
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not add the stream.');
    }
  };

  return (
    <Modal onClose={onClose} title="Offer a stream">
      <div className="space-y-4">
        <SelectField
          label="University stream"
          required
          value={streamId}
          onChange={(event) => setStreamId(event.target.value)}
          options={available}
          hint="Only branches the university currently publishes."
        />

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset"
          >
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={addStream.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={addStream.isPending || !streamId}
          >
            {addStream.isPending ? 'Adding…' : 'Offer this stream'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
