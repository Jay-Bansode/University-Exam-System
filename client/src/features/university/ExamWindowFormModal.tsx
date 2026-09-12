import { useState, type FormEvent } from 'react';
import { academicYearLabel, type ExamWindowDetail } from '@ues/shared';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { SelectField } from '@/components/SelectField';
import { NO_ERRORS, toFormErrors, type FormErrors } from '@/lib/form-errors';
import { useCreateExamWindow, useUpdateExamWindow } from '@/api/exam-windows';

/**
 * `<input type="datetime-local">` expects and produces local wall-clock time with no
 * zone, while the API speaks ISO 8601 in UTC. These two convert between them.
 *
 * Slicing the ISO string would be wrong: it would hand the browser a UTC time and label
 * it local, shifting every date by the viewer's offset — five and a half hours in India.
 */
function toLocalInputValue(isoString: string): string {
  const date = new Date(isoString);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromLocalInputValue(localValue: string): string {
  return new Date(localValue).toISOString();
}

/** Offers the current academic year and its neighbours, so the format is never mistyped. */
function academicYearOptions(): { value: string; label: string }[] {
  const now = new Date();
  // Indian academic years start in July, so before July we are still in the year that
  // began last calendar year.
  const currentStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;

  return [-1, 0, 1].map((offset) => {
    const label = academicYearLabel(currentStart + offset);
    return { value: label, label };
  });
}

const SEMESTER_OPTIONS = Array.from({ length: 8 }, (_, index) => ({
  value: String(index + 1),
  label: `Semester ${index + 1}`,
}));

export function ExamWindowFormModal({
  onClose,
  window: examWindow,
}: {
  onClose: () => void;
  window?: ExamWindowDetail;
}) {
  const isEditing = Boolean(examWindow);
  const yearOptions = academicYearOptions();

  const [academicYear, setAcademicYear] = useState(
    examWindow?.academicYear ?? yearOptions[1]!.value,
  );
  const [semester, setSemester] = useState(String(examWindow?.semester ?? 5));
  const [openAt, setOpenAt] = useState(
    examWindow ? toLocalInputValue(examWindow.openAt) : '',
  );
  const [closeAt, setCloseAt] = useState(
    examWindow ? toLocalInputValue(examWindow.closeAt) : '',
  );
  const [isPublished, setIsPublished] = useState(examWindow?.isPublished ?? false);
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);

  const createWindow = useCreateExamWindow();
  const updateWindow = useUpdateExamWindow();
  const isSaving = createWindow.isPending || updateWindow.isPending;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);

    const payload = {
      academicYear,
      semester: Number(semester),
      openAt: fromLocalInputValue(openAt),
      closeAt: fromLocalInputValue(closeAt),
      isPublished,
    };

    try {
      if (examWindow) {
        await updateWindow.mutateAsync({ id: examWindow.id, ...payload });
      } else {
        await createWindow.mutateAsync(payload);
      }
      onClose();
    } catch (error) {
      setErrors(toFormErrors(error));
    }
  };

  return (
    <Modal
      onClose={onClose}
      title={isEditing ? 'Edit registration window' : 'Schedule a registration window'}
    >
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Academic year"
            required
            value={academicYear}
            onChange={(event) => setAcademicYear(event.target.value)}
            errors={errors.fields.academicYear}
            options={yearOptions}
          />

          <SelectField
            label="Semester"
            required
            value={semester}
            onChange={(event) => setSemester(event.target.value)}
            errors={errors.fields.semester}
            options={SEMESTER_OPTIONS}
          />
        </div>

        <FormField
          label="Opens"
          type="datetime-local"
          required
          value={openAt}
          onChange={(event) => setOpenAt(event.target.value)}
          errors={errors.fields.openAt}
        />

        <FormField
          label="Closes"
          type="datetime-local"
          required
          value={closeAt}
          onChange={(event) => setCloseAt(event.target.value)}
          errors={errors.fields.closeAt}
          hint="Shown in your local time. Stored and compared in UTC."
        />

        <label className="flex items-start gap-2.5 rounded-lg bg-slate-50 p-3">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(event) => setIsPublished(event.target.checked)}
            className="mt-0.5 size-4 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-200"
          />
          <span className="text-sm">
            <span className="font-medium text-slate-900">Publish this window</span>
            <span className="block text-slate-600">
              An unpublished window never accepts forms, whatever its dates say. Leave it
              off to schedule ahead of time.
            </span>
          </span>
        </label>

        {errors.message && (
          <p
            role="alert"
            className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset"
          >
            {errors.message}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Schedule window'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
