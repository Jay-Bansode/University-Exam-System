/**
 * Marks a feature that is planned but not yet built.
 *
 * Shown rather than hidden on purpose. A visible, honest "coming in Phase N" reads as a
 * roadmap; a dead link or an empty page reads as a bug.
 */
export function PhaseNotice({ phase, items }: { phase: string; items: string[] }) {
  return (
    <section className="rounded-xl border border-dashed border-slate-300 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900">Coming next · {phase}</h2>
      <ul className="mt-3 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm text-slate-600">
            <span
              aria-hidden="true"
              className="mt-2 size-1.5 shrink-0 rounded-full bg-slate-300"
            />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
