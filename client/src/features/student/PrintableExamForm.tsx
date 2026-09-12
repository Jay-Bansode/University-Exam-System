import {
  EXAM_FORM_STATUS_LABELS,
  EntryType,
  SUBJECT_TYPE_LABELS,
  yearLabelFor,
  type ExamFormDetail,
} from '@ues/shared';

/**
 * The exam form as it appears on paper.
 *
 * Colleges genuinely file these, so this is laid out as a document rather than as a web
 * page: a header identifying the university and college, a details block, a numbered
 * subject table, and a signature line. The print rules in `styles/index.css` force A4
 * portrait and drop anything marked `no-print`.
 *
 * Deliberately monochrome and border-based. Background colours are commonly stripped by
 * browser print settings, so anything conveyed only by a coloured fill would vanish.
 */
export function PrintableExamForm({ form }: { form: ExamFormDetail }) {
  const submitted = form.submittedAt ? new Date(form.submittedAt) : null;

  return (
    <article className="mx-auto max-w-[210mm] bg-white p-6 text-slate-900 sm:p-8 print:p-0">
      <header className="border-b-2 border-slate-900 pb-3 text-center">
        <h1 className="text-lg font-bold tracking-wide uppercase">
          University of Mumbai
        </h1>
        <p className="mt-0.5 text-sm">{form.collegeName}</p>
        <p className="mt-2 text-base font-semibold">
          Examination Form &middot; Semester {form.semester} &middot; {form.academicYear}
        </p>
      </header>

      <div className="mt-4 flex items-start justify-between gap-4 text-sm">
        <dl className="flex-1 space-y-1">
          <Row label="Form number" value={form.formNumber ?? 'Not yet assigned'} mono />
          <Row label="Status" value={EXAM_FORM_STATUS_LABELS[form.status]} />
          <Row
            label="Submitted on"
            value={submitted ? submitted.toLocaleString() : 'Not submitted'}
          />
        </dl>

        {/* Kept even when empty so the printed page always has a photo box to sign
            across, which is how these forms are actually used. */}
        <div className="flex size-24 shrink-0 items-center justify-center border border-slate-400 text-center text-[10px] text-slate-500">
          {form.student.photoUrl ? (
            <img src={form.student.photoUrl} alt="" className="size-full object-cover" />
          ) : (
            'Photograph'
          )}
        </div>
      </div>

      <section className="mt-4 border-t border-slate-300 pt-3">
        <h2 className="mb-2 text-xs font-bold tracking-wide uppercase">
          Candidate details
        </h2>
        <dl className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          <Row label="Name" value={form.student.fullName} />
          <Row label="Roll number" value={form.student.rollNumber} mono />
          <Row label="College code" value={form.collegeCode} mono />
          <Row label="Branch" value={form.streamName} />
          <Row label="Programme" value={form.student.programType} />
          <Row
            label="Year"
            value={yearLabelFor(form.semester, form.student.programType)}
          />
          <Row
            label="Admission type"
            value={
              form.student.entryType === EntryType.Lateral
                ? 'Direct Second Year'
                : 'Regular'
            }
          />
        </dl>
      </section>

      <section className="mt-4 border-t border-slate-300 pt-3">
        <h2 className="mb-2 text-xs font-bold tracking-wide uppercase">
          Subjects registered
        </h2>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-slate-400 text-left text-xs uppercase">
              <th scope="col" className="w-8 py-1.5 pr-2 font-semibold">
                #
              </th>
              <th scope="col" className="py-1.5 pr-3 font-semibold">
                Code
              </th>
              <th scope="col" className="py-1.5 pr-3 font-semibold">
                Subject
              </th>
              <th scope="col" className="py-1.5 pr-3 font-semibold">
                Type
              </th>
              <th scope="col" className="py-1.5 text-right font-semibold">
                Credits
              </th>
            </tr>
          </thead>
          <tbody>
            {form.subjects.map((subject, index) => (
              <tr key={subject.id} className="border-b border-slate-200">
                <td className="py-1.5 pr-2">{index + 1}</td>
                <td className="py-1.5 pr-3 font-mono">{subject.code}</td>
                <td className="py-1.5 pr-3">{subject.name}</td>
                <td className="py-1.5 pr-3">
                  {SUBJECT_TYPE_LABELS[subject.subjectType]}
                </td>
                <td className="py-1.5 text-right">{subject.credits}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-b-2 border-slate-900 font-semibold">
              <td className="py-1.5" colSpan={4}>
                Total &middot; {form.subjects.length} subject
                {form.subjects.length === 1 ? '' : 's'}
              </td>
              <td className="py-1.5 text-right">{form.totalCredits}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="mt-6 text-sm">
        <p className="text-xs text-slate-600">
          I declare that the particulars given above are true to the best of my knowledge.
        </p>

        <div className="mt-10 flex justify-between gap-8">
          <SignatureLine label="Signature of candidate" />
          <SignatureLine label="Signature of college authority" />
        </div>
      </section>
    </article>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="min-w-32 text-slate-600">{label}</dt>
      <dd className={mono ? 'font-mono font-medium' : 'font-medium'}>{value}</dd>
    </div>
  );
}

function SignatureLine({ label }: { label: string }) {
  return (
    <div className="flex-1">
      <div className="border-t border-slate-500" />
      <p className="mt-1 text-xs text-slate-600">{label}</p>
    </div>
  );
}
