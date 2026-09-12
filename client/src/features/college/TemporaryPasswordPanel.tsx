import { useState } from 'react';
import { Button } from '@/components/Button';

/**
 * Shows a generated password exactly once.
 *
 * Used after creating a person and after resetting one's password. The server stores
 * only a bcrypt hash, so this really is the only opportunity to read it — the wording
 * says so rather than letting an administrator discover it by closing too early.
 */
export function TemporaryPasswordPanel({
  heading,
  email,
  password,
  onDone,
}: {
  heading: string;
  email?: string;
  password: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      // Clipboard access can be refused, and the password is visible on screen anyway.
      setCopied(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700">{heading}</p>

      <div className="rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200 ring-inset">
        <p className="text-sm font-medium text-amber-900">
          Copy this password now — it cannot be shown again.
        </p>
        <p className="mt-1 text-xs text-amber-800">
          Only a hash is stored. If it is lost, issue a new one.
        </p>

        <div className="mt-3 flex items-center gap-2">
          <code className="flex-1 rounded border border-amber-300 bg-white px-2.5 py-2 font-mono text-sm break-all text-slate-900">
            {password}
          </code>
          <Button size="sm" variant="secondary" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>

      {email && (
        <dl className="text-sm">
          <div className="flex justify-between border-b border-slate-100 py-2">
            <dt className="text-slate-500">Email</dt>
            <dd className="font-mono text-slate-900">{email}</dd>
          </div>
        </dl>
      )}

      <div className="flex justify-end">
        <Button onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}
