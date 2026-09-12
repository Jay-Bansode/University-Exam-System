import { useState } from 'react';
import {
  SUBJECT_TYPE_LABELS,
  academicYearLabel,
  yearLabelFor,
  type CollegeStreamDetail,
} from '@ues/shared';
import { useCollegeStreams } from '@/api/enrolment';
import { useDeleteOffering, useOfferings } from '@/api/offerings';
import { ApiError } from '@/api/client';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { SelectField } from '@/components/SelectField';
import { OfferingEditor } from './OfferingEditor';

/** The current academic year plus its neighbours, matching the exam-window form. */
function academicYearOptions() {
  const now = new Date();
  const currentStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;

  return [-1, 0, 1].map((offset) => {
    const label = academicYearLabel(currentStart + offset);
    return { value: label, label };
  });
}

/**
 * Faculty's working page: which subjects this college runs, per stream and semester.
 *
 * The subject list on offer comes entirely from the university's syllabus. There is no
 * "create subject" control here, and no endpoint behind one — faculty select from an
 * approved catalogue, which is what keeps marksheets comparable across colleges.
 */
export default function OfferingsPage() {
  const { data: streams, isPending: streamsPending } = useCollegeStreams();

  const yearOptions = academicYearOptions();
  const [academicYear, setAcademicYear] = useState(yearOptions[1]!.value);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [semester, setSemester] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: offerings, isPending } = useOfferings({ academicYear });
  const deleteOffering = useDeleteOffering();

  const selectedStream: CollegeStreamDetail | undefined =
    streams?.find((stream) => stream.streamId === streamId) ?? streams?.[0];

  const activeStreamId = streamId ?? selectedStream?.streamId ?? null;

  const remove = async (id: string) => {
    setActionError(null);
    if (!window.confirm('Remove this offering entirely?')) return;

    try {
      await deleteOffering.mutateAsync(id);
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Could not remove.');
    }
  };

  if (streamsPending) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1].map((row) => (
          <div key={row} className="h-24 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    );
  }

  if (!streams || streams.length === 0) {
    return (
      <>
        <PageHeader title="Semester offerings" />
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-medium text-slate-900">No streams to teach yet</p>
          <p className="mt-1 text-sm text-slate-600">
            Your college administrator has not added any streams. Offerings are built per
            stream and semester.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Semester offerings"
        subtitle="Choose which of the university's subjects this college runs each semester."
      />

      {actionError && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset"
        >
          {actionError}
        </p>
      )}

      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-3 font-semibold text-slate-900">Build an offering</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label="Academic year"
            value={academicYear}
            onChange={(event) => setAcademicYear(event.target.value)}
            options={yearOptions}
          />

          <SelectField
            label="Stream"
            value={activeStreamId ?? ''}
            onChange={(event) => {
              setStreamId(event.target.value);
              setSemester(null);
            }}
            options={streams.map((stream) => ({
              value: stream.streamId,
              label: `${stream.streamName} (${stream.programType})`,
            }))}
          />

          <SelectField
            label="Semester"
            value={semester ? String(semester) : ''}
            onChange={(event) => setSemester(Number(event.target.value))}
            placeholder="Choose a semester"
            options={Array.from(
              { length: selectedStream?.totalSemesters ?? 8 },
              (_, index) => index + 1,
            ).map((value) => ({
              value: String(value),
              label: `Semester ${value} · ${yearLabelFor(
                value,
                selectedStream!.programType,
              )}`,
            }))}
          />
        </div>

        {activeStreamId && semester && selectedStream && (
          <OfferingEditor
            key={`${activeStreamId}-${semester}-${academicYear}`}
            streamId={activeStreamId}
            semester={semester}
            academicYear={academicYear}
            existing={offerings?.find(
              (offering) =>
                offering.streamId === activeStreamId && offering.semester === semester,
            )}
          />
        )}
      </section>

      <h2 className="mb-3 font-semibold text-slate-900">Offerings for {academicYear}</h2>

      {isPending && (
        <div className="space-y-2" aria-busy="true">
          {[0, 1].map((row) => (
            <div key={row} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      )}

      {offerings && offerings.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-medium text-slate-900">Nothing offered yet</p>
          <p className="mt-1 text-sm text-slate-600">
            Students cannot register for a semester until its subjects are chosen.
          </p>
        </div>
      )}

      {offerings && offerings.length > 0 && (
        <ul className="space-y-3">
          {offerings.map((offering) => (
            <li
              key={offering.id}
              className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    {offering.streamName} · Semester {offering.semester}
                  </h3>
                  <p className="text-sm text-slate-600">
                    {offering.academicYear} · {offering.subjects.length} subject
                    {offering.subjects.length === 1 ? '' : 's'} · {offering.totalCredits}{' '}
                    credits
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setStreamId(offering.streamId);
                      setSemester(offering.semester);
                      setAcademicYear(offering.academicYear);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => void remove(offering.id)}
                    disabled={deleteOffering.isPending}
                  >
                    Remove
                  </Button>
                </div>
              </div>

              <ul className="mt-3 divide-y divide-slate-100">
                {offering.subjects.map((subject) => (
                  <li
                    key={subject.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <p className="text-sm text-slate-900">
                      <span className="font-mono text-slate-600">{subject.code}</span>{' '}
                      {subject.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {SUBJECT_TYPE_LABELS[subject.subjectType]} · {subject.credits}{' '}
                      credit{subject.credits === 1 ? '' : 's'}
                    </p>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
