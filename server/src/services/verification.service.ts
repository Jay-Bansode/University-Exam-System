import { Types } from 'mongoose';
import type {
  ExamFormQueueResponse,
  ExamFormSummary,
  VerificationCounts,
} from '@ues/shared';
import { EXAM_FORM_STATUS_LABELS, ExamFormStatus, Role } from '@ues/shared';
import { ExamFormModel, type ExamFormDocument } from '../models/exam-form.model.js';
import { UserModel, type UserDocument } from '../models/user.model.js';
import type { SubjectDocument } from '../models/subject.model.js';
import { AppError } from '../utils/app-error.js';
import { requireScope, scopeFilter, type TenantScope } from '../utils/scoped-query.js';
import { formatFullName } from '../utils/names.js';

/**
 * Verification: the clerk's desk.
 *
 * A clerk checks a submitted form against whatever the student brings to the office,
 * then verifies it or sends it back with a reason. Everything is tenant-scoped, so a
 * clerk only ever sees their own college's queue.
 */

type PopulatedRef = { _id: unknown; name?: string; code?: string };

const POPULATE_SUMMARY = [
  { path: 'studentId', select: 'firstName middleName lastName studentProfile' },
  { path: 'streamId', select: 'name code' },
  { path: 'subjectIds', select: 'credits' },
];

function toSummary(form: ExamFormDocument): ExamFormSummary {
  const student = form.studentId as unknown as UserDocument | null;
  const stream = form.streamId as unknown as PopulatedRef | null;
  const subjects = (form.subjectIds as unknown as SubjectDocument[]).filter(
    (subject) => subject && typeof subject === 'object' && 'credits' in subject,
  );

  return {
    id: String(form._id),
    formNumber: form.formNumber ?? null,
    status: form.status,
    studentName: student ? formatFullName(student) : '',
    rollNumber: student?.studentProfile?.rollNumber ?? '',
    streamName: stream?.name ?? '',
    semester: form.semester,
    academicYear: form.academicYear,
    subjectCount: subjects.length,
    totalCredits: subjects.reduce((sum, subject) => sum + subject.credits, 0),
    submittedAt: form.submittedAt ? form.submittedAt.toISOString() : null,
    rejectionReason: form.rejectionReason ?? null,
  };
}

/**
 * The clerk's queue, with counts per status.
 *
 * Searching by student name needs the student's name, which lives on `User` rather than
 * on the form. Rather than an aggregation with `$lookup`, the matching students are
 * found first — a query the `{ collegeId, role, lastName, firstName }` index already
 * serves — and their ids are then used to filter forms. Two indexed queries beat one
 * pipeline that cannot use either index well.
 */
export async function listFormsForVerification(
  collegeId: TenantScope | undefined,
  options: { status?: string; search?: string; limit?: number } = {},
): Promise<ExamFormQueueResponse> {
  const scope = requireScope(collegeId);

  const baseFilter: Record<string, unknown> = {};

  if (options.search?.trim()) {
    const escaped = options.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prefix = new RegExp(`^${escaped}`, 'i');

    const students = await UserModel.find(
      scopeFilter(
        {
          role: Role.Student,
          $or: [
            { firstName: prefix },
            { lastName: prefix },
            { 'studentProfile.rollNumber': prefix },
          ],
        },
        collegeId,
      ),
    ).distinct('_id');

    baseFilter.studentId = { $in: students };
  }

  const scoped = scopeFilter(baseFilter, collegeId);

  const [forms, grouped] = await Promise.all([
    ExamFormModel.find(options.status ? { ...scoped, status: options.status } : scoped)
      .populate(POPULATE_SUMMARY)
      // Oldest submission first: a queue should be worked in the order people joined it.
      .sort({ submittedAt: 1, updatedAt: -1 })
      .limit(Math.min(options.limit ?? 50, 200)) as Promise<ExamFormDocument[]>,

    // Counts ignore the status filter on purpose, so the tabs keep showing how much is
    // in each state while one of them is being viewed.
    ExamFormModel.aggregate<{ _id: string; count: number }>([
      { $match: scope === null ? baseFilter : { ...baseFilter, collegeId: scope } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const counts: VerificationCounts = {
    submitted: 0,
    verified: 0,
    rejected: 0,
    draft: 0,
  };

  for (const row of grouped) {
    if (row._id in counts) counts[row._id as keyof VerificationCounts] = row.count;
  }

  return { forms: forms.map(toSummary), counts };
}

/**
 * Loads a form the clerk is allowed to act on.
 *
 * Only a `submitted` form can be verified or rejected. A draft has not been handed in
 * yet, and a decision has already been recorded on the other two — so acting on them
 * would silently overwrite an earlier clerk's work.
 */
async function loadActionableForm(
  id: string,
  collegeId: TenantScope | undefined,
): Promise<ExamFormDocument> {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound('Exam form not found.');

  const form = (await ExamFormModel.findOne(
    scopeFilter({ _id: new Types.ObjectId(id) }, collegeId),
  ).populate(POPULATE_SUMMARY)) as ExamFormDocument | null;

  if (!form) throw AppError.notFound('Exam form not found.');

  if (form.status !== ExamFormStatus.Submitted) {
    throw AppError.conflict(
      form.status === ExamFormStatus.Draft
        ? 'This form has not been submitted yet.'
        : `This form has already been ${EXAM_FORM_STATUS_LABELS[form.status].toLowerCase()}.`,
    );
  }

  return form;
}

export async function verifyForm(
  id: string,
  collegeId: TenantScope | undefined,
  clerkId: Types.ObjectId,
): Promise<ExamFormSummary> {
  const form = await loadActionableForm(id, collegeId);

  form.status = ExamFormStatus.Verified;
  form.verifiedAt = new Date();
  form.verifiedBy = clerkId;
  // A form that was previously sent back and corrected must not keep the old reason.
  form.rejectionReason = null;

  await form.save();

  return toSummary(form);
}

/**
 * Sends a form back to the student with a reason.
 *
 * The reason is required and is the whole point of the action: the student is the only
 * person who can fix the form, and "rejected" on its own tells them nothing about what
 * to change. The form returns to an editable state and keeps its number.
 */
export async function rejectForm(
  id: string,
  reason: string,
  collegeId: TenantScope | undefined,
  clerkId: Types.ObjectId,
): Promise<ExamFormSummary> {
  const form = await loadActionableForm(id, collegeId);

  form.status = ExamFormStatus.Rejected;
  form.rejectionReason = reason.trim();
  form.verifiedAt = new Date();
  form.verifiedBy = clerkId;
  // Cleared so the student's next submission records its own timestamp rather than
  // appearing to have been submitted before it was corrected.
  form.submittedAt = null;

  await form.save();

  return toSummary(form);
}
