import { useId, type InputHTMLAttributes } from 'react';

/**
 * A labelled input that renders server-side validation errors.
 *
 * `errors` is the array the API returns under `error.details[field]`, so a 422 from Zod
 * lands next to the offending input with no per-form translation. `useId` guarantees the
 * label-to-input association even when the same field appears in two forms on one page.
 */
export function FormField({
  label,
  errors,
  hint,
  ...inputProps
}: {
  label: string;
  errors?: string[];
  hint?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const hasError = Boolean(errors?.length);

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
        {inputProps.required && (
          <span aria-hidden="true" className="ml-0.5 text-rose-600">
            *
          </span>
        )}
      </label>

      <input
        id={id}
        aria-invalid={hasError || undefined}
        aria-describedby={
          [hasError ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') ||
          undefined
        }
        {...inputProps}
        className={`mt-1 w-full rounded-lg border px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 ${
          hasError
            ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
            : 'border-slate-300 focus:border-brand-600 focus:ring-brand-200'
        }`}
      />

      {hint && !hasError && (
        <p id={hintId} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      )}

      {hasError && (
        <p id={errorId} className="mt-1 text-xs text-rose-700">
          {errors!.join('. ')}
        </p>
      )}
    </div>
  );
}
