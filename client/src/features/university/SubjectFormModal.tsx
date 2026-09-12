import { useState, type FormEvent } from 'react';
import {
  SUBJECT_TYPE_LABELS,
  SubjectType,
  yearLabelFor,
  type StreamDetail,
  type SubjectDetail,
} from '@ues/shared';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { SelectField } from '@/components/SelectField';
import { NO_ERRORS, toFormErrors, type FormErrors } from '@/lib/form-errors';
import { useCreateSubject, useUpdateSubject } from '@/api/syllabus';

const TYPE_OPTIONS = Object.entries(SUBJECT_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export function SubjectFormModal({
  onClose,
  stream,
  subject,
  defaultSemester,
}: {
  onClose: () => void;
  stream: StreamDetail;
  subject?: SubjectDetail;
  defaultSemester: number;
}) {
  const isEditing = Boolean(subject);

  const [semester, setSemester] = useState(String(subject?.semester ?? defaultSemester));
  const [name, setName] = useState(subject?.name ?? '');
  const [code, setCode] = useState(subject?.code ?? '');
  const [credits, setCredits] = useState(String(subject?.credits ?? 3));
  const [subjectType, setSubjectType] = useState<string>(
    subject?.subjectType ?? SubjectType.Theory,
  );
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);

  const createSubject = useCreateSubject();
  const updateSubject = useUpdateSubject();
  const isSaving = createSubject.isPending || updateSubject.isPending;

  /**
   * The options stop at the stream's own semester count — six for a Diploma, eight for a
   * BE — so an impossible semester cannot be chosen in the first place. The server
   * enforces the same rule, because a disabled option in the browser proves nothing.
   */
  const semesterOptions = Array.from(
    { length: stream.totalSemesters },
    (_, index) => index + 1,
  ).map((value) => ({
    value: String(value),
    label: `Semester ${value} · ${yearLabelFor(value, stream.programType)}`,
  }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);

    const payload = {
      semester: Number(semester),
      name: name.trim(),
      code: code.trim().toUpperCase(),
      credits: Number(credits),
      subjectType: subjectType as SubjectType,
    };

    try {
      if (subject) {
        await updateSubject.mutateAsync({ id: subject.id, ...payload });
      } else {
        await createSubject.mutateAsync({ streamId: stream.id, ...payload });
      }
      onClose();
    } catch (error) {
      setErrors(toFormErrors(error));
    }
  };

  return (
    <Modal onClose={onClose} title={isEditing ? 'Edit subject' : 'Add a subject'}>
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <p className="text-sm text-slate-600">
          For <span className="font-medium text-slate-900">{stream.name}</span> (
          {stream.programType}).
        </p>

        <SelectField
          label="Semester"
          required
          value={semester}
          onChange={(event) => setSemester(event.target.value)}
          errors={errors.fields.semester}
          options={semesterOptions}
        />

        <FormField
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          errors={errors.fields.name}
          placeholder="Theoretical Computer Science"
        />

        <FormField
          label="Code"
          required
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          errors={errors.fields.code}
          hint="Unique within this stream. Printed on forms and marksheets."
          placeholder="CSC501"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Credits"
            type="number"
            step="0.5"
            min="0"
            max="20"
            required
            value={credits}
            onChange={(event) => setCredits(event.target.value)}
            errors={errors.fields.credits}
          />

          <SelectField
            label="Type"
            required
            value={subjectType}
            onChange={(event) => setSubjectType(event.target.value)}
            errors={errors.fields.subjectType}
            options={TYPE_OPTIONS}
          />
        </div>

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
            {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Add subject'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
