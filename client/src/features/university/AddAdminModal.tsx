import { useState, type FormEvent } from 'react';
import type { CollegeWithStats, CreateCollegeAdminResponse } from '@ues/shared';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { NO_ERRORS, toFormErrors, type FormErrors } from '@/lib/form-errors';
import { useCreateCollegeAdmin } from '@/api/colleges';

/**
 * Creates a college administrator, then shows the generated password once.
 *
 * The server generates the password and stores only its bcrypt hash, so this screen is
 * the single opportunity to read it. The UI says so plainly rather than letting an
 * administrator discover it by closing the dialog too early.
 */
export function AddAdminModal({
  onClose,
  college,
}: {
  onClose: () => void;
  college: CollegeWithStats;
}) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [created, setCreated] = useState<CreateCollegeAdminResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const createAdmin = useCreateCollegeAdmin();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);

    try {
      const result = await createAdmin.mutateAsync({
        collegeId: college.id,
        email: email.trim(),
        firstName: firstName.trim(),
        ...(middleName.trim() ? { middleName: middleName.trim() } : {}),
        lastName: lastName.trim(),
      });
      setCreated(result);
    } catch (error) {
      setErrors(toFormErrors(error));
    }
  };

  const copyPassword = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.temporaryPassword);
      setCopied(true);
    } catch {
      // Clipboard access can be refused by the browser, and the password is on screen
      // anyway, so this is not worth surfacing as an error.
      setCopied(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      title={created ? 'Administrator created' : 'Add an administrator'}
    >
      {created ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            <span className="font-medium">{created.user.fullName}</span> can now sign in
            to {college.name}.
          </p>

          <div className="rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200 ring-inset">
            <p className="text-sm font-medium text-amber-900">
              Copy this password now — it cannot be shown again.
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Only a hash is stored. If it is lost, issue a new one.
            </p>

            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 rounded border border-amber-300 bg-white px-2.5 py-2 font-mono text-sm break-all text-slate-900">
                {created.temporaryPassword}
              </code>
              <Button size="sm" variant="secondary" onClick={() => void copyPassword()}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>

          <dl className="text-sm">
            <div className="flex justify-between border-b border-slate-100 py-2">
              <dt className="text-slate-500">Email</dt>
              <dd className="font-mono text-slate-900">{created.user.email}</dd>
            </div>
          </dl>

          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          <p className="text-sm text-slate-600">
            For <span className="font-medium text-slate-900">{college.name}</span>. A
            password is generated automatically and shown once.
          </p>

          <FormField
            label="Email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            errors={errors.fields.email}
            placeholder="principal@college.edu.in"
          />

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

          {errors.message && (
            <p
              role="alert"
              className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset"
            >
              {errors.message}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={createAdmin.isPending}
            >
              Cancel
            </Button>
            <button
              type="submit"
              disabled={createAdmin.isPending}
              className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createAdmin.isPending ? 'Creating…' : 'Create administrator'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
