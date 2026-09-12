import { Types } from 'mongoose';
import type {
  ExamFormDetail,
  MyExamFormResponse,
  OfferableSubject,
  SubmissionBlock,
} from '@ues/shared';
import {
  EntryType,
  ExamFormStatus,
  Role,
  SubmissionBlock as Block,
  isEditableStatus,
} from '@ues/shared';
import { ExamFormModel, type ExamFormDocument } from '../models/exam-form.model.js';
import {
  SemesterOfferingModel,
  type SemesterOfferingDocument,
} from '../models/semester-offering.model.js';
import { UserModel, type UserDocument } from '../models/user.model.js';
import type { SubjectDocument } from '../models/subject.model.js';
import {
  ExamWindowModel,
  isWindowOpen,
  windowStatus,
} from '../models/exam-window.model.js';
import { AppError } from '../utils/app-error.js';
import { scopeFilter, type TenantScope } from '../utils/scoped-query.js';
import { nextSequence } from '../models/counter.model.js';
import { formatFullName } from '../utils/names.js';

/**
 * The exam form — the system's central document.
 *
 * Three chained constraints decide what a student may register for, and all three are
 * checked here rather than trusted from the browser:
 *
 *   1. The university publishes a syllabus for the stream and semester.
 *   2. The college offers a subset of it (`SemesterOffering`).
 *   3. The student registers for a subset of *that*.
 *
 * On top of which, submission is only possible while the university's exam window for
 * that semester is open.
 */

type PopulatedRef = { _id: unknown; name?: string; code?: string };

function toOfferableSubject(subject: SubjectDocument): OfferableSubject {
  return {
    id: String(subject._id),
    code: subject.code,
    name: subject.name,
    credits: subject.credits,
    subjectType: subject.subjectType,
    isActive: subject.isActive,
  };
}

const POPULATE_FORM = [
  { path: 'studentId', select: 'firstName middleName lastName studentProfile' },
  { path: 'collegeId', select: 'name code' },
  { path: 'streamId', select: 'name code' },
  { path: 'subjectIds', select: 'code name credits subjectType isActive' },
];

function toExamFormDetail(form: ExamFormDocument): ExamFormDetail {
  const student = form.studentId as unknown as UserDocument | null;
  const college = form.collegeId as unknown as PopulatedRef | null;
  const stream = form.streamId as unknown as PopulatedRef | null;

  const subjects = (form.subjectIds as unknown as SubjectDocument[])
    .filter((subject) => subject && typeof subject === 'object' && 'code' in subject)
    .map(toOfferableSubject);

  const profile = student?.studentProfile;

  return {
    id: String(form._id),
    // Mongoose types a field with a `null` default as `string | null | undefined`, so
    // these are normalised to `null` at the boundary rather than leaking `undefined`
    // into a response where the client expects one absent value, not two.
    formNumber: form.formNumber ?? null,
    status: form.status,

    student: {
      id: String(student?._id ?? form.studentId),
      fullName: student ? formatFullName(student) : '',
      rollNumber: profile?.rollNumber ?? '',
      programType: profile?.programType ?? 'BE',
      entryType: profile?.entryType ?? EntryType.Regular,
      photoUrl: profile?.photoUrl ?? null,
    },

    collegeName: college?.name ?? '',
    collegeCode: college?.code ?? '',
    streamName: stream?.name ?? '',
    streamCode: stream?.code ?? '',

    academicYear: form.academicYear,
    semester: form.semester,

    subjects,
    totalCredits: subjects.reduce((sum, subject) => sum + subject.credits, 0),

    submittedAt: form.submittedAt ? form.submittedAt.toISOString() : null,
    verifiedAt: form.verifiedAt ? form.verifiedAt.toISOString() : null,
    rejectionReason: form.rejectionReason ?? null,
    updatedAt: form.updatedAt.toISOString(),
  };
}

/** Loads the signed-in student with the fields the form needs. */
async function loadStudent(userId: Types.ObjectId): Promise<UserDocument> {
  const student = (await UserModel.findById(userId)) as UserDocument | null;

  if (!student || student.role !== Role.Student) {
    throw AppError.forbidden('Only a student has an exam form.');
  }

  if (!student.studentProfile?.streamId) {
    throw AppError.badRequest(
      'Your enrolment is incomplete. Ask your college office to set your stream and semester.',
    );
  }

  return student;
}

/**
 * The academic year is derived from the open window rather than from today's date.
 *
 * A registration window can legitimately straddle a year boundary, and the form must be
 * filed against the year the university is actually collecting for — not whichever year
 * the server clock falls in.
 */
async function resolveContext(student: UserDocument) {
  const semester = student.studentProfile!.currentSemester ?? 1;

  const window = await ExamWindowModel.findOne({ semester }).sort({ academicYear: -1 });

  const offering = (await SemesterOfferingModel.findOne({
    collegeId: student.collegeId,
    streamId: student.studentProfile!.streamId,
    semester,
    ...(window ? { academicYear: window.academicYear } : {}),
  }).populate(
    'subjectIds',
    'code name credits subjectType isActive',
  )) as SemesterOfferingDocument | null;

  return { semester, window, offering };
}

/**
 * Everything the student's page needs, in one request.
 *
 * `block` names the specific obstacle rather than returning a bare false, because
 * "your college has not published subjects yet" and "registration closed on Friday"
 * need different words and different next steps.
 */
export async function getMyExamForm(userId: Types.ObjectId): Promise<MyExamFormResponse> {
  const student = await loadStudent(userId);
  const { semester, window, offering } = await resolveContext(student);

  const academicYear = window?.academicYear ?? '';

  const form = (await ExamFormModel.findOne({
    studentId: student._id,
    semester,
    ...(academicYear ? { academicYear } : {}),
  }).populate(POPULATE_FORM)) as ExamFormDocument | null;

  const availableSubjects = offering
    ? (offering.subjectIds as unknown as SubjectDocument[])
        .filter((subject) => subject && typeof subject === 'object' && 'code' in subject)
        .map(toOfferableSubject)
    : [];

  let block: SubmissionBlock | null = null;

  if (form && !isEditableStatus(form.status)) {
    block = Block.AlreadySubmitted;
  } else if (!offering) {
    block = Block.NoOffering;
  } else if (!window) {
    block = Block.NoWindow;
  } else if (!isWindowOpen(window)) {
    block = Block.WindowNotOpen;
  } else if (availableSubjects.length === 0) {
    block = Block.NoSubjects;
  }

  const canEdit = block === null;

  return {
    form: form ? toExamFormDetail(form) : null,
    availableSubjects,
    window: window
      ? {
          id: String(window._id),
          academicYear: window.academicYear,
          semester: window.semester,
          openAt: window.openAt.toISOString(),
          closeAt: window.closeAt.toISOString(),
          isPublished: window.isPublished,
          isOpenNow: isWindowOpen(window),
          status: windowStatus(window),
        }
      : null,
    academicYear,
    semester,
    canEdit,
    canSubmit: canEdit,
    block,
  };
}

/**
 * Validates the chosen subjects against the college's offering.
 *
 * The offering is the authority, not the university's full syllabus: a student may only
 * register for what their own college is actually running this semester.
 */
function resolveSelection(
  offering: SemesterOfferingDocument,
  subjectIds: string[],
): Types.ObjectId[] {
  const unique = [...new Set(subjectIds)];

  if (unique.length !== subjectIds.length) {
    throw AppError.badRequest('The same subject was selected more than once.', {
      subjectIds: ['Remove the duplicates'],
    });
  }

  const offered = new Set(
    (offering.subjectIds as unknown as (SubjectDocument | Types.ObjectId)[]).map(
      (subject) =>
        typeof subject === 'object' && '_id' in subject
          ? String(subject._id)
          : String(subject),
    ),
  );

  const notOffered = unique.filter((id) => !offered.has(id));
  if (notOffered.length > 0) {
    throw AppError.badRequest(
      `${notOffered.length} selected subject${notOffered.length === 1 ? ' is' : 's are'} not offered by your college this semester.`,
      { subjectIds: ['Choose only subjects your college is running'] },
    );
  }

  return unique.map((id) => new Types.ObjectId(id));
}

/** Loads the context needed to write, refusing when any precondition fails. */
async function loadWritableContext(userId: Types.ObjectId, requireOpenWindow: boolean) {
  const student = await loadStudent(userId);
  const { semester, window, offering } = await resolveContext(student);

  if (!offering) {
    throw AppError.badRequest(
      'Your college has not published subjects for this semester yet.',
    );
  }

  if (!window) {
    throw AppError.badRequest(
      'The university has not scheduled registration for this semester.',
    );
  }

  /**
   * Checked on the server against the server's clock, every time. The client is told
   * whether the window is open so it can explain itself, but this is the check that
   * actually decides — a browser clock is under the user's control.
   */
  if (requireOpenWindow && !isWindowOpen(window)) {
    const status = windowStatus(window);
    throw AppError.badRequest(
      status === 'closed'
        ? `Registration for semester ${semester} closed on ${window.closeAt.toDateString()}.`
        : 'Registration for this semester is not open yet.',
    );
  }

  return { student, semester, window, offering };
}

export async function saveDraft(
  userId: Types.ObjectId,
  subjectIds: string[],
): Promise<ExamFormDetail> {
  // A draft may be saved before the window opens: preparing early is reasonable, and
  // only submission is time-bound.
  const { student, semester, window, offering } = await loadWritableContext(
    userId,
    false,
  );

  const selected = resolveSelection(offering, subjectIds);

  const existing = await ExamFormModel.findOne({
    studentId: student._id,
    academicYear: window.academicYear,
    semester,
  });

  if (existing && !isEditableStatus(existing.status)) {
    throw AppError.conflict('This form has been submitted and can no longer be edited.');
  }

  const form =
    existing ??
    new ExamFormModel({
      collegeId: student.collegeId,
      studentId: student._id,
      offeringId: offering._id,
      streamId: student.studentProfile!.streamId,
      academicYear: window.academicYear,
      semester,
    });

  form.subjectIds = selected;
  form.status = ExamFormStatus.Draft;
  // A resubmitted form starts clean: last time's rejection reason must not linger on a
  // form the student has since corrected.
  form.rejectionReason = null;
  await form.save();

  await form.populate(POPULATE_FORM);
  return toExamFormDetail(form);
}

/**
 * Submits the form and assigns its number.
 *
 * The number is issued here and never accepted from the client. It comes from an atomic
 * counter scoped to college, year and semester, so two students submitting at the same
 * instant cannot receive the same number.
 */
export async function submitForm(
  userId: Types.ObjectId,
  subjectIds: string[],
): Promise<ExamFormDetail> {
  const { student, semester, window, offering } = await loadWritableContext(userId, true);

  if (subjectIds.length === 0) {
    throw AppError.badRequest('Select at least one subject before submitting.', {
      subjectIds: ['Select at least one subject'],
    });
  }

  const selected = resolveSelection(offering, subjectIds);

  const existing = await ExamFormModel.findOne({
    studentId: student._id,
    academicYear: window.academicYear,
    semester,
  });

  if (existing && !isEditableStatus(existing.status)) {
    throw AppError.conflict(
      existing.status === ExamFormStatus.Verified
        ? 'This form has already been verified.'
        : 'This form has already been submitted and is awaiting verification.',
    );
  }

  const college = student.collegeId as unknown as PopulatedRef | Types.ObjectId;
  const collegeCode = await resolveCollegeCode(college);

  const form =
    existing ??
    new ExamFormModel({
      collegeId: student.collegeId,
      studentId: student._id,
      offeringId: offering._id,
      streamId: student.studentProfile!.streamId,
      academicYear: window.academicYear,
      semester,
    });

  form.subjectIds = selected;
  form.status = ExamFormStatus.Submitted;
  form.submittedAt = new Date();
  form.rejectionReason = null;

  // A form keeps the number it was first given. Re-submitting a rejected form must not
  // issue a second one, or the student would hold two numbers for one registration.
  form.formNumber ??= await buildFormNumber(collegeCode, window.academicYear, semester);

  await form.save();
  await form.populate(POPULATE_FORM);

  return toExamFormDetail(form);
}

async function resolveCollegeCode(
  college: PopulatedRef | Types.ObjectId,
): Promise<string> {
  if (typeof college === 'object' && 'code' in college && college.code) {
    return college.code;
  }

  const { CollegeModel } = await import('../models/college.model.js');
  const found = await CollegeModel.findById(college).select('code');
  return found?.code ?? 'UNK';
}

/** `MGMCET/2026-27/S5/00042` — readable, sortable, and unique per college and semester. */
async function buildFormNumber(
  collegeCode: string,
  academicYear: string,
  semester: number,
): Promise<string> {
  const sequence = await nextSequence(`form:${collegeCode}:${academicYear}:${semester}`);
  return `${collegeCode}/${academicYear}/S${semester}/${String(sequence).padStart(5, '0')}`;
}

/**
 * Reads one form by id.
 *
 * A student may read only their own; staff may read any form in their own college. Both
 * paths fail with 404 rather than 403, so a wrong id never confirms that a form exists.
 */
export async function getExamFormById(
  id: string,
  auth: { userId: Types.ObjectId; role: Role },
  collegeId: TenantScope | undefined,
): Promise<ExamFormDetail> {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound('Exam form not found.');

  const filter: Record<string, unknown> = { _id: new Types.ObjectId(id) };
  if (auth.role === Role.Student) filter.studentId = auth.userId;

  const form = (await ExamFormModel.findOne(scopeFilter(filter, collegeId)).populate(
    POPULATE_FORM,
  )) as ExamFormDocument | null;

  if (!form) throw AppError.notFound('Exam form not found.');

  return toExamFormDetail(form);
}

/** A student's own history across semesters. */
export async function listMyExamForms(userId: Types.ObjectId): Promise<ExamFormDetail[]> {
  const forms = (await ExamFormModel.find({ studentId: userId })
    .populate(POPULATE_FORM)
    .sort({ academicYear: -1, semester: -1 })) as ExamFormDocument[];

  return forms.map(toExamFormDetail);
}
