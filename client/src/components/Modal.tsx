import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A modal dialog built on the native `<dialog>` element.
 *
 * Using the platform element rather than a hand-rolled overlay gets several things for
 * free that are easy to get wrong: focus is trapped inside while open, Escape closes it,
 * the rest of the page is inert to assistive technology, and it renders in the top layer
 * so no `z-index` fight is possible.
 *
 * **Mounted means open.** There is no `isOpen` prop: the parent renders this only while
 * the dialog should be shown. That makes every open a fresh mount, so a form inside
 * starts from its initial state without an effect copying props into state — which is
 * both simpler and what `react-hooks/set-state-in-effect` exists to push you towards.
 */
export function Modal({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    // `showModal()` must be called imperatively. The `open` attribute alone produces a
    // non-modal dialog with none of the focus or inertness behaviour above.
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      // Fires for Escape as well as an explicit close(), so the parent unmounts the
      // dialog however it was dismissed.
      onClose={onClose}
      // Clicking the backdrop targets the dialog element itself, never its children.
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      aria-labelledby="modal-title"
      className="m-auto w-[calc(100vw-2rem)] max-w-md rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <h2 id="modal-title" className="font-semibold text-slate-900">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-m-1 rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="size-5"
            aria-hidden="true"
          >
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      <div className="px-5 py-4">{children}</div>
    </dialog>
  );
}
