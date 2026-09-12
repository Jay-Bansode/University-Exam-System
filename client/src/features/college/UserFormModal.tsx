import { useState, type FormEvent } from 'react';
import {
  EntryType,
  ROLE_LABELS,
  Role,
  semesterRangeFor,
  yearLabelFor,
  type CollegeStreamDetail,
  type CreateUserResponse,
  type ManagedUser,
} from '@ues/shared';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { SelectField } from '@/components/SelectField';
import { NO_ERRORS, toFormErrors, type FormErrors } from '@/lib/form-errors';
import { useCreateUser, useUpdateUser } from '@/api/enrolment';
import { TemporaryPasswordPanel } from './TemporaryPasswordPanel';

/**
 * Adds or edits a person at this college.
 *
 * Only faculty, clerks and students can be chosen. Creating a college admin is the
 * university's job, so a tenant cannot expand its own administration — the option is
 * absent here and the server rejects it regardless.
 */
const ROLE_OPTIONS = [Role.Faculty, Role.Clerk, Role.Student].map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
}));

const ENTRY_OPTIONS = [
  { value: EntryType.Regular, label: 'Regular (from semester 1)' },
  { value: EntryType.Lateral, label: 'Direct Second Year (from semester 3)' },
];

export function UserFormModal({
  onClose,
  streams,
  user,
}: {
  onClose: () => void;
  streams: CollegeStreamDetail[];
  user?: ManagedUser;
}) {
  const isEditing = Boolean(user);

  const [role, setRole] = useState<string>(user?.role ?? Role.Student);
  const [email, setEmail] = useState(user?.email ?? '');
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [middleName, setMiddleName] = useState(user?.middleName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');

  const [rollNumber, setRollNumber] = useState(user?.student?.rollNumber ?? '');
  const [streamId, setStreamId] = useState(
    user?.student?.streamId ?? streams[0]?.streamId ?? '',
  );
  const [entryType, setEntryType] = useState<string>(
    user?.student?.entryType ?? EntryType.Regular,
  );
  const [currentSemester, setCurrentSemester] = useState(
    String(user?.student?.currentSemester ?? 1),
  );

  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [created, setCreated] = useState<CreateUserResponse | null>(null);

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const isSaving = createUser.isPending || updateUser.isPending;

  const isStudent = role === Role.Student;
  const selectedStream = streams.find((stream) => stream.streamId === streamId);

  /**
   * The semester options follow both the programme and the entry type. A lateral-entry
   * student begins at semester 3, so 1 and 2 never appear for them. The server applies
   * the same rule, because a dropdown proves nothing about what was actually submitted.
   */
  const semesterOptions = (() => {
    if (!selectedStream) return [];
    const { min, max } = semesterRangeFor(
      selectedStream.programType,
      entryType as EntryType,
    );
    return Array.from({ length: max - min + 1 }, (_, index) => min + index).map(
      (value) => ({
        value: String(value),
        label: `Semester ${value} · ${yearLabelFor(value, selectedStream.programType)}`,
      }),
    );
  })();

  // Keeps the chosen semester legal when the stream or entry type changes beneath it.
  const semesterValue = semesterOptions.some((option) => option.value === currentSemester)
    ? currentSemester
    : (semesterOptions[0]?.value ?? '');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);

    const student = isStudent
      ? {
          rollNumber: rollNumber.trim().toUpperCase(),
          streamId,
          entryType: entryType as EntryType,
          currentSemester: Number(semesterValue),
        }
      : undefined;

    try {
      if (user) {
        await updateUser.mutateAsync({
          id: user.id,
          firstName: firstName.trim(),
          middleName: middleName.trim(),
          lastName: lastName.trim(),
          ...(student ? { student } : {}),
        });
        onClose();
      } else {
        const result = await createUser.mutateAsync({
          role: role as 'faculty' | 'clerk' | 'student',
          email: email.trim(),
          firstName: firstName.trim(),
          ...(middleName.trim() ? { middleName: middleName.trim() } : {}),
          lastName: lastName.trim(),
          ...(student ? { student } : {}),
        });
        setCreated(result);
      }
    } catch (error) {
      setErrors(toFormErrors(error));
    }
  };

  if (created) {
    return (
      <Modal onClose={onClose} title={`${ROLE_LABELS[created.user.role]} added`}>
        <TemporaryPasswordPanel
          heading={`${created.user.fullName} can now sign in.`}
          email={created.user.email}
          password={created.temporaryPassword}
          onDone={onClose}
        />
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} title={isEditing ? 'Edit person' : 'Add a person'}>
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        {!isEditing && (
          <SelectField
            label="Role"
            required
            value={role}
            onChange={(event) => setRole(event.target.value)}
            errors={errors.fields.role}
            options={ROLE_OPTIONS}
            hint="College administrators are created by the university."
          />
        )}

        {!isEditing && (
          <FormField
            label="Email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            errors={errors.fields.email}
            hint="Used to sign in. Must be unique across the whole university."
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="First name"
            required
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            errors={errors.fields.firstName}
          />
          <FormField
            label="Last name"
            required
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
        />

        {isStudent && (
          <div className="space-y-4 rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Enrolment
            </p>

            {streams.length === 0 ? (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200 ring-inset">
                This college does not offer any streams yet. Add one before enrolling
                students.
              </p>
            ) : (
              <>
                <FormField
                  label="Roll number"
                  required
                  value={rollNumber}
                  onChange={(event) => setRollNumber(event.target.value.toUpperCase())}
                  errors={errors.fields['student.rollNumber']}
                  hint="Unique within this college. May repeat at another college."
                  placeholder="CE23001"
                />

                <SelectField
                  label="Stream"
                  required
                  value={streamId}
                  onChange={(event) => setStreamId(event.target.value)}
                  errors={errors.fields['student.streamId']}
                  options={streams.map((stream) => ({
                    value: stream.streamId,
                    label: `${stream.streamName} (${stream.programType})`,
                  }))}
                  hint="Only streams this college offers. The programme follows from it."
                />

                <SelectField
                  label="Admission type"
                  required
                  value={entryType}
                  onChange={(event) => setEntryType(event.target.value)}
                  errors={errors.fields['student.entryType']}
                  options={ENTRY_OPTIONS}
                />

                <SelectField
                  label="Current semester"
                  required
                  value={semesterValue}
                  onChange={(event) => setCurrentSemester(event.target.value)}
                  errors={errors.fields['student.currentSemester']}
                  options={semesterOptions}
                />
              </>
            )}
          </div>
        )}

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
            disabled={isSaving || (isStudent && streams.length === 0)}
            className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Add person'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
