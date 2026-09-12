import { useState } from 'react';
import type { ExamWindowDetail } from '@ues/shared';
import {
  useDeleteExamWindow,
  useExamWindows,
  useUpdateExamWindow,
} from '@/api/exam-windows';
import { ApiError } from '@/api/client';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { ExamWindowFormModal } from './ExamWindowFormModal';

const STATUS_STYLES: Record<ExamWindowDetail['status'], string> = {
  open: 'bg-emerald-100 text-emerald-900',
  upcoming: 'bg-sky-100 text-sky-900',
  closed: 'bg-slate-200 text-slate-700',
  draft: 'bg-amber-100 text-amber-900',
};

const STATUS_LABELS: Record<ExamWindowDetail['status'], string> = {
  open: 'Open now',
  upcoming: 'Upcoming',
  closed: 'Closed',
  draft: 'Draft',
};

/** Dates are rendered in the viewer's locale; the server stores and compares UTC. */
function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Exam registration windows.
 *
 * This is how the university controls the calendar across every affiliated college at
 * once. A college cannot open registration early or leave it open late — the rule is
 * checked server-side when a form is submitted.
 */
export default function ExamWindowsPage() {
  const { data: windows, isPending, isError } = useExamWindows();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExamWindowDetail | undefined>();
  const [actionError, setActionError] = useState<string | null>(null);

  const updateWindow = useUpdateExamWindow();
  const deleteWindow = useDeleteExamWindow();

  const togglePublished = async (examWindow: ExamWindowDetail) => {
    setActionError(null);

    if (examWindow.isPublished && examWindow.isOpenNow) {
      const confirmed = window.confirm(
        'This window is open right now. Unpublishing it stops every college accepting exam forms immediately. Continue?',
      );
      if (!confirmed) return;
    }

    try {
      await updateWindow.mutateAsync({
        id: examWindow.id,
        isPublished: !examWindow.isPublished,
      });
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Could not update.');
    }
  };

  const remove = async (examWindow: ExamWindowDetail) => {
    setActionError(null);
    if (!window.confirm('Delete this registration window?')) return;

    try {
      await deleteWindow.mutateAsync(examWindow.id);
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Could not delete.');
    }
  };

  return (
    <>
      <PageHeader
        title="Exam registration windows"
        subtitle="Colleges can accept exam forms only while a published window is open."
        action={
          <Button
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            Schedule window
          </Button>
        }
      />

      {actionError && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset"
        >
          {actionError}
        </p>
      )}

      {isPending && (
        <div className="space-y-2" aria-busy="true">
          {[0, 1].map((row) => (
            <div key={row} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      )}

      {isError && (
        <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset">
          Could not load registration windows.
        </p>
      )}

      {windows && windows.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-medium text-slate-900">No windows scheduled</p>
          <p className="mt-1 text-sm text-slate-600">
            Until one is open and published, no college can accept exam forms.
          </p>
        </div>
      )}

      {windows && windows.length > 0 && (
        <ul className="space-y-3">
          {windows.map((examWindow) => (
            <li
              key={examWindow.id}
              className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-slate-900">
                      Semester {examWindow.semester}
                    </h2>
                    <span className="text-sm text-slate-500">
                      {examWindow.academicYear}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[examWindow.status]}`}
                    >
                      {STATUS_LABELS[examWindow.status]}
                    </span>
                  </div>

                  <dl className="mt-2 grid gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2">
                    <div className="flex gap-2">
                      <dt className="text-slate-500">Opens</dt>
                      <dd className="text-slate-900">
                        {formatDateTime(examWindow.openAt)}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-slate-500">Closes</dt>
                      <dd className="text-slate-900">
                        {formatDateTime(examWindow.closeAt)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditing(examWindow);
                      setFormOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void togglePublished(examWindow)}
                    disabled={updateWindow.isPending}
                  >
                    {examWindow.isPublished ? 'Unpublish' : 'Publish'}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => void remove(examWindow)}
                    disabled={deleteWindow.isPending}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              {examWindow.status === 'draft' && (
                <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 ring-1 ring-amber-200 ring-inset">
                  Not published, so no college can accept forms for this semester —
                  whatever the dates say.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {formOpen && (
        <ExamWindowFormModal onClose={() => setFormOpen(false)} window={editing} />
      )}
    </>
  );
}
