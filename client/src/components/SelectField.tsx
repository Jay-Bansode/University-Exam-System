import { useId, type SelectHTMLAttributes } from 'react';

/**
 * A labelled `<select>` that renders server-side validation errors, matching
 * `FormField`'s behaviour so a form of mixed inputs stays visually consistent.
 */
export function SelectField({
  label,
  errors,
  hint,
  options,
  placeholder,
  ...selectProps
}: {
  label: string;
  errors?: string[];
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const hasError = Boolean(errors?.length);

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
        {selectProps.required && (
          <span aria-hidden="true" className="ml-0.5 text-rose-600">
            *
          </span>
        )}
      </label>

      <select
        id={id}
        aria-invalid={hasError || undefined}
        aria-describedby={
          [hasError ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') ||
          undefined
        }
        {...selectProps}
        className={`mt-1 w-full rounded-lg border bg-white px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 ${
          hasError
            ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
            : 'border-slate-300 focus:border-brand-600 focus:ring-brand-200'
        }`}
      >
        {placeholder && (
          // An empty value means "nothing chosen", so a required select fails native
          // validation until the user actually picks something.
          <option value="">{placeholder}</option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

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
