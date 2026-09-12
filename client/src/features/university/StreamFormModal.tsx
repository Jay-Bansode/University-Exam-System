import { useState, type FormEvent } from 'react';
import { ProgramType, TOTAL_SEMESTERS, type StreamDetail } from '@ues/shared';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { SelectField } from '@/components/SelectField';
import { NO_ERRORS, toFormErrors, type FormErrors } from '@/lib/form-errors';
import { useCreateStream, useUpdateStream } from '@/api/syllabus';

const PROGRAM_OPTIONS = [
  { value: ProgramType.BE, label: `BE / B.Tech — ${TOTAL_SEMESTERS.BE} semesters` },
  {
    value: ProgramType.Diploma,
    label: `Diploma — ${TOTAL_SEMESTERS.Diploma} semesters`,
  },
];

export function StreamFormModal({
  onClose,
  stream,
}: {
  onClose: () => void;
  stream?: StreamDetail;
}) {
  const isEditing = Boolean(stream);

  const [name, setName] = useState(stream?.name ?? '');
  const [code, setCode] = useState(stream?.code ?? '');
  const [programType, setProgramType] = useState<string>(
    stream?.programType ?? ProgramType.BE,
  );
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);

  const createStream = useCreateStream();
  const updateStream = useUpdateStream();
  const isSaving = createStream.isPending || updateStream.isPending;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);

    const payload = {
      name: name.trim(),
      code: code.trim().toUpperCase(),
      programType: programType as ProgramType,
    };

    try {
      if (stream) {
        await updateStream.mutateAsync({ id: stream.id, ...payload });
      } else {
        await createStream.mutateAsync(payload);
      }
      onClose();
    } catch (error) {
      setErrors(toFormErrors(error));
    }
  };

  return (
    <Modal onClose={onClose} title={isEditing ? 'Edit stream' : 'Add a stream'}>
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <FormField
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          errors={errors.fields.name}
          placeholder="Computer Engineering"
        />

        <FormField
          label="Code"
          required
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          errors={errors.fields.code}
          hint="2-10 characters. A code may repeat across different programmes."
          placeholder="CE"
        />

        <SelectField
          label="Programme"
          required
          value={programType}
          onChange={(event) => setProgramType(event.target.value)}
          errors={errors.fields.programType}
          options={PROGRAM_OPTIONS}
          hint="Determines how many semesters this stream has."
        />

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
            {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Create stream'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
