import { useState } from 'react';
import { SUBJECT_TYPE_LABELS, type OfferingDetail } from '@ues/shared';
import { useOfferableSubjects, useSaveOffering } from '@/api/offerings';
import { Button } from '@/components/Button';
import { NO_ERRORS, toFormErrors, type FormErrors } from '@/lib/form-errors';

/**
 * The subject picker for one stream, semester and academic year.
 *
 * Mounted with a `key` that changes whenever that combination changes, so each selection
 * starts from the right initial state without an effect copying props into state.
 *
 * The list shown is the university's published syllabus for that semester. Retired
 * subjects appear but cannot be selected, which is more honest than hiding them — an
 * offering that already contains one needs to show why it must be removed.
 */
export function OfferingEditor({
  streamId,
  semester,
  academicYear,
  existing,
}: {
  streamId: string;
  semester: number;
  academicYear: string;
  existing?: OfferingDetail;
}) {
  const { data: available, isPending } = useOfferableSubjects(streamId, semester);

  const [selected, setSelected] = useState<Set<string>>(
    new Set(existing?.subjects.map((subject) => subject.id) ?? []),
  );
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [saved, setSaved] = useState(false);

  const saveOffering = useSaveOffering();

  const toggle = (id: string) => {
    setSaved(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setErrors(NO_ERRORS);
    setSaved(false);

    try {
      await saveOffering.mutateAsync({
        streamId,
        academicYear,
        semester,
        subjectIds: [...selected],
      });
      setSaved(true);
    } catch (error) {
      setErrors(toFormErrors(error));
    }
  };

  const totalCredits = (available ?? [])
    .filter((subject) => selected.has(subject.id))
    .reduce((sum, subject) => sum + subject.credits, 0);

  if (isPending) {
    return (
      <div className="mt-4 space-y-2" aria-busy="true">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-10 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
    );
  }

  if (!available || available.length === 0) {
    return (
      <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200 ring-inset">
        The university has not published any subjects for semester {semester} of this
        stream, so there is nothing to offer yet.
      </p>
    );
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          {selected.size} of {available.length} selected · {totalCredits} credits
        </p>

        <div className="flex items-center gap-2">
          {saved && (
            <span
              role="status"
              className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900"
            >
              Saved
            </span>
          )}
          <Button
            onClick={() => void save()}
            disabled={saveOffering.isPending || selected.size === 0}
            size="sm"
          >
            {saveOffering.isPending
              ? 'Saving…'
              : existing
                ? 'Update offering'
                : 'Create offering'}
          </Button>
        </div>
      </div>

      <ul className="space-y-1.5">
        {available.map((subject) => {
          const isSelected = selected.has(subject.id);
          const isRetired = !subject.isActive;

          return (
            <li key={subject.id}>
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 transition ${
                  isRetired
                    ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-70'
                    : isSelected
                      ? 'border-brand-400 bg-brand-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={isRetired}
                  onChange={() => toggle(subject.id)}
                  className="mt-0.5 size-4 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-200"
                />

                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-slate-900">
                    <span className="font-mono text-slate-600">{subject.code}</span>{' '}
                    {subject.name}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {SUBJECT_TYPE_LABELS[subject.subjectType]} · {subject.credits} credit
                    {subject.credits === 1 ? '' : 's'}
                    {isRetired && ' · retired by the university'}
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

      {errors.fields.subjectIds && (
        <p className="mt-2 text-xs text-rose-700">
          {errors.fields.subjectIds.join('. ')}
        </p>
      )}
    </div>
  );
}
