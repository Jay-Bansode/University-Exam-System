import { useState, type FormEvent } from 'react';
import type { CollegeWithStats } from '@ues/shared';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { NO_ERRORS, toFormErrors, type FormErrors } from '@/lib/form-errors';
import { useCreateCollege, useUpdateCollege } from '@/api/colleges';

/**
 * Create-or-edit form for a college.
 *
 * One component for both, because the fields are identical and only the request differs.
 * Two near-duplicate components would drift the moment a field is added.
 *
 * State is initialised straight from props rather than copied in by an effect. The
 * parent mounts this only while the dialog is open, so every open is a fresh mount and
 * the initial values are simply correct — no synchronisation, and no cascading render.
 */
export function CollegeFormModal({
  onClose,
  college,
}: {
  onClose: () => void;
  /** Present when editing, absent when creating. */
  college?: CollegeWithStats;
}) {
  const isEditing = Boolean(college);

  const [name, setName] = useState(college?.name ?? '');
  const [code, setCode] = useState(college?.code ?? '');
  const [city, setCity] = useState(college?.city ?? '');
  const [address, setAddress] = useState(college?.address ?? '');
  const [affiliationYear, setAffiliationYear] = useState(
    college?.affiliationYear ? String(college.affiliationYear) : '',
  );
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);

  const createCollege = useCreateCollege();
  const updateCollege = useUpdateCollege();
  const isSaving = createCollege.isPending || updateCollege.isPending;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);

    // Optional fields are omitted rather than sent empty, so a blank input is not
    // mistaken for an instruction to clear a stored value.
    const payload = {
      name: name.trim(),
      code: code.trim().toUpperCase(),
      ...(city.trim() ? { city: city.trim() } : {}),
      ...(address.trim() ? { address: address.trim() } : {}),
      ...(affiliationYear ? { affiliationYear: Number(affiliationYear) } : {}),
    };

    try {
      if (college) {
        await updateCollege.mutateAsync({ id: college.id, ...payload });
      } else {
        await createCollege.mutateAsync(payload);
      }
      onClose();
    } catch (error) {
      setErrors(toFormErrors(error));
    }
  };

  return (
    <Modal onClose={onClose} title={isEditing ? 'Edit college' : 'Add a college'}>
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <FormField
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          errors={errors.fields.name}
          placeholder="Vidyalankar Institute of Technology"
        />

        <FormField
          label="Affiliation code"
          required
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          errors={errors.fields.code}
          hint="2-12 characters: A-Z, 0-9 or hyphen. Shown on forms and marksheets."
          placeholder="VIT"
        />

        <FormField
          label="City"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          errors={errors.fields.city}
          placeholder="Mumbai"
        />

        <FormField
          label="Address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          errors={errors.fields.address}
        />

        <FormField
          label="Affiliation year"
          type="number"
          inputMode="numeric"
          value={affiliationYear}
          onChange={(event) => setAffiliationYear(event.target.value)}
          errors={errors.fields.affiliationYear}
          placeholder="1999"
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
            {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Create college'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
