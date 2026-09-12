export function FullPageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-3"
      role="status"
      aria-live="polite"
    >
      <span className="size-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      <p className="text-sm text-slate-500">{label}…</p>
    </div>
  );
}
