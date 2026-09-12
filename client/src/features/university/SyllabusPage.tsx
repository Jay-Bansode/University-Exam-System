import { useState } from 'react';
import {
  SUBJECT_TYPE_LABELS,
  yearLabelFor,
  type StreamDetail,
  type SubjectDetail,
} from '@ues/shared';
import {
  useDeleteStream,
  useDeleteSubject,
  useStreams,
  useSubjects,
} from '@/api/syllabus';
import { ApiError } from '@/api/client';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { StreamFormModal } from './StreamFormModal';
import { SubjectFormModal } from './SubjectFormModal';

/**
 * The master syllabus.
 *
 * A stream is selected on the left and its subjects are shown on the right, grouped by
 * semester. That mirrors how the data is actually shaped — a subject only means anything
 * in the context of a stream and a semester — and avoids a single flat table of hundreds
 * of rows that nobody can scan.
 */
export default function SyllabusPage() {
  const { data: streams, isPending, isError } = useStreams();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [streamFormOpen, setStreamFormOpen] = useState(false);
  const [editingStream, setEditingStream] = useState<StreamDetail | undefined>();
  const [subjectFormOpen, setSubjectFormOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<SubjectDetail | undefined>();
  const [actionError, setActionError] = useState<string | null>(null);

  const deleteStream = useDeleteStream();
  const deleteSubject = useDeleteSubject();

  // Falls back to the first stream so the page is never empty on arrival, and recovers
  // on its own if the selected stream is deleted.
  const selected =
    streams?.find((stream) => stream.id === selectedId) ?? streams?.[0] ?? null;

  const { data: subjects, isPending: subjectsPending } = useSubjects(
    selected ? { streamId: selected.id } : {},
  );

  const removeStream = async (stream: StreamDetail) => {
    setActionError(null);
    if (!window.confirm(`Delete ${stream.name}? This cannot be undone.`)) return;

    try {
      await deleteStream.mutateAsync(stream.id);
      setSelectedId(null);
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Could not delete.');
    }
  };

  const removeSubject = async (subject: SubjectDetail) => {
    setActionError(null);
    if (!window.confirm(`Delete ${subject.code} — ${subject.name}?`)) return;

    try {
      await deleteSubject.mutateAsync(subject.id);
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Could not delete.');
    }
  };

  // Grouped for display, since a syllabus is read semester by semester.
  const bySemester = new Map<number, SubjectDetail[]>();
  for (const subject of subjects ?? []) {
    const group = bySemester.get(subject.semester) ?? [];
    group.push(subject);
    bySemester.set(subject.semester, group);
  }
  const semesters = [...bySemester.keys()].sort((a, b) => a - b);

  return (
    <>
      <PageHeader
        title="Master syllabus"
        subtitle="Published by the university. Colleges teach from this catalogue but cannot change it."
        action={
          <Button
            onClick={() => {
              setEditingStream(undefined);
              setStreamFormOpen(true);
            }}
          >
            Add stream
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

      {isError && (
        <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset">
          Could not load the syllabus.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
        <section aria-label="Streams">
          {isPending ? (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2].map((row) => (
                <div key={row} className="h-14 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          ) : streams && streams.length > 0 ? (
            <ul className="space-y-1.5">
              {streams.map((stream) => {
                const isSelected = selected?.id === stream.id;

                return (
                  <li key={stream.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(stream.id)}
                      aria-current={isSelected ? 'true' : undefined}
                      className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                        isSelected
                          ? 'border-brand-400 bg-brand-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <span className="block text-sm font-medium text-slate-900">
                        {stream.name}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {stream.code} · {stream.programType} · {stream.subjectCount}{' '}
                        subject{stream.subjectCount === 1 ? '' : 's'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
              <p className="text-sm font-medium text-slate-900">No streams yet</p>
              <p className="mt-1 text-xs text-slate-600">
                Add a branch such as Computer Engineering.
              </p>
            </div>
          )}
        </section>

        {selected && (
          <section
            aria-label={`Subjects for ${selected.name}`}
            className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-semibold text-slate-900">{selected.name}</h2>
                <p className="text-sm text-slate-600">
                  {selected.programType} · {selected.totalSemesters} semesters
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEditingStream(selected);
                    setStreamFormOpen(true);
                  }}
                >
                  Edit stream
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingSubject(undefined);
                    setSubjectFormOpen(true);
                  }}
                >
                  Add subject
                </Button>
                {selected.subjectCount === 0 && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => void removeStream(selected)}
                  >
                    Delete stream
                  </Button>
                )}
              </div>
            </div>

            {subjectsPending ? (
              <div className="mt-4 space-y-2" aria-busy="true">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="h-10 animate-pulse rounded bg-slate-100" />
                ))}
              </div>
            ) : semesters.length === 0 ? (
              <p className="mt-6 text-center text-sm text-slate-500">
                No subjects published for this stream yet.
              </p>
            ) : (
              <div className="mt-4 space-y-6">
                {semesters.map((semester) => (
                  <div key={semester}>
                    <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      Semester {semester} · {yearLabelFor(semester, selected.programType)}
                    </h3>

                    <ul className="mt-2 divide-y divide-slate-100">
                      {bySemester.get(semester)!.map((subject) => (
                        <li
                          key={subject.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900">
                              <span className="font-mono text-slate-600">
                                {subject.code}
                              </span>{' '}
                              {subject.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {SUBJECT_TYPE_LABELS[subject.subjectType]} ·{' '}
                              {subject.credits} credit{subject.credits === 1 ? '' : 's'}
                              {!subject.isActive && ' · retired'}
                            </p>
                          </div>

                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setEditingSubject(subject);
                                setSubjectFormOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => void removeSubject(subject)}
                            >
                              Delete
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {streamFormOpen && (
        <StreamFormModal
          onClose={() => setStreamFormOpen(false)}
          stream={editingStream}
        />
      )}

      {subjectFormOpen && selected && (
        <SubjectFormModal
          onClose={() => setSubjectFormOpen(false)}
          stream={selected}
          subject={editingSubject}
          defaultSemester={semesters[0] ?? 1}
        />
      )}
    </>
  );
}
