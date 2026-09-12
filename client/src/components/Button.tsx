import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-600',
  secondary:
    'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-brand-600',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:outline-rose-600',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: {
  variant?: Variant;
  size?: 'sm' | 'md';
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizing = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2.5 text-sm';

  return (
    <button
      // Buttons default to type="submit" inside a form, which is a common source of
      // accidental submits from what was meant to be an ordinary action button.
      type="button"
      {...props}
      className={`rounded-lg font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${sizing} ${className}`}
    />
  );
}
