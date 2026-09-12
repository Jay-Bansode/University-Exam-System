import { Types } from 'mongoose';
import type {
  CorrectionChanges,
  CorrectionRequestDetail,
  CreateCorrectionRequest,
} from '@ues/shared';
import { CorrectionStatus, Role, requiredDocumentsFor } from '@ues/shared';
import {
  CorrectionRequestModel,
  type CorrectionRequestDocument,
} from '../models/correction-request.model.js';
import { UserModel, type UserDocument } from '../models/user.model.js';
import { CollegeModel } from '../models/college.model.js';
import { nextSequence } from '../models/counter.model.js';
import { AppError } from '../utils/app-error.js';
import { requireScope, scopeFilter, type TenantScope } from '../utils/scoped-query.js';
import { formatFullName } from '../utils/names.js';
import { isOwnCloudinaryUrl } from '../config/cloudinary.js';

/**
 * Correction requests.
 *
 * A student cannot change their own name, date of birth or photograph — those are
 * printed on a marksheet, so altering them is an administrative act backed by documents.
 * The student raises a ticket, the office checks the paperwork, and only then is the
 * profile touched.
 */

function toISODate(value: Date | undefined | null): string | undefined {
  return value ? value.toISOString().slice(0, 10) : undefined;
}

/**
 * The shape of a `requested` or `previous` sub-document once narrowed.
 *
 * Mongoose types a nested sub-document as possibly absent and its optional fields as
 * `T | null | undefined`. Narrowing once here keeps every caller free of repeated
 * guards, and `null` and `undefined` mean the same thing to us: this field is not part
 * of the request.
 */
type StoredChanges = {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  dateOfBirth?: Date | null;
  photoUrl?: string | null;
};

function narrow(changes: unknown): StoredChanges {
  return (changes ?? {}) as StoredChanges;
}

/** Drops keys with no value, so absent means "not part of this request". */
function compact(changes: Record<string, string | null | undefined>): CorrectionChanges {
  return Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined && value !== null),
  ) as CorrectionChanges;
}

function toDetail(request: CorrectionRequestDocument): CorrectionRequestDetail {
  const student = request.studentId as unknown as UserDocument | null;

  const stored = narrow(request.requested);
  const before = narrow(request.previous);

  const requested = compact({
    firstName: stored.firstName,
    middleName: stored.middleName,
    lastName: stored.lastName,
    dateOfBirth: toISODate(stored.dateOfBirth),
    photoUrl: stored.photoUrl,
  });

  const current = compact({
    firstName: before.firstName,
    middleName: before.middleName,
    lastName: before.lastName,
    dateOfBirth: toISODate(before.dateOfBirth),
    photoUrl: before.photoUrl,
  });

  return {
    id: String(request._id),
    ticketNumber: request.ticketNumber,
    status: request.status,

    studentId: String(student?._id ?? request.studentId),
    studentName: student ? formatFullName(student) : '',
    rollNumber: student?.studentProfile?.rollNumber ?? '',

    current,
    requested,
    requiredDocuments: requiredDocumentsFor(requested),

    reason: request.reason ?? null,

    createdAt: request.createdAt.toISOString(),
    reviewedAt: request.reviewedAt ? request.reviewedAt.toISOString() : null,
  };
}

const POPULATE_STUDENT = {
  path: 'studentId',
  select: 'firstName middleName lastName studentProfile',
};

/** `MGMCET/COR/000042` — readable, and unique per college. */
async function buildTicketNumber(collegeId: Types.ObjectId): Promise<string> {
  const college = await CollegeModel.findById(collegeId).select('code');
  const code = college?.code ?? 'UNK';

  const sequence = await nextSequence(`correction:${code}`);
  return `${code}/COR/${String(sequence).padStart(6, '0')}`;
}

/**
 * Raises a ticket.
 *
 * Only values that actually differ from the current record are kept. Submitting the form
 * unchanged should not create a ticket for the office to process, and a "change" that
 * changes nothing is almost always an accidental submit.
 */
export async function createCorrectionRequest(
  userId: Types.ObjectId,
  input: CreateCorrectionRequest,
): Promise<CorrectionRequestDetail> {
  const student = (await UserModel.findById(userId)) as UserDocument | null;

  if (!student || student.role !== Role.Student) {
    throw AppError.forbidden('Only a student can raise a correction request.');
  }

  const profile = student.studentProfile;

  const requested: Record<string, unknown> = {};
  const previous: Record<string, unknown> = {};

  const compareText = (
    field: 'firstName' | 'middleName' | 'lastName',
    supplied: string | undefined,
  ) => {
    if (supplied === undefined) return;

    const currentValue = student[field] ?? '';
    const nextValue = supplied.trim();

    if (nextValue === currentValue) return;

    requested[field] = nextValue;
    previous[field] = currentValue;
  };

  compareText('firstName', input.firstName);
  compareText('middleName', input.middleName);
  compareText('lastName', input.lastName);

  if (input.dateOfBirth !== undefined) {
    const nextDate = new Date(input.dateOfBirth);
    const currentDate = profile?.dateOfBirth;

    if (Number.isNaN(nextDate.getTime())) {
      throw AppError.badRequest('That date of birth is not valid.', {
        dateOfBirth: ['Enter a valid date'],
      });
    }

    if (toISODate(currentDate) !== toISODate(nextDate)) {
      requested.dateOfBirth = nextDate;
      previous.dateOfBirth = currentDate;
    }
  }

  if (input.photoUrl !== undefined) {
    /**
     * The browser uploads directly to Cloudinary and then reports the resulting URL, so
     * this value is user-supplied. Without pinning it to our own account and folder, a
     * student could submit any address on the internet and have it stored and displayed.
     */
    if (!isOwnCloudinaryUrl(input.photoUrl)) {
      throw AppError.badRequest('That photograph could not be verified.', {
        photoUrl: ['Upload the photograph through this form'],
      });
    }

    if (input.photoUrl !== profile?.photoUrl) {
      requested.photoUrl = input.photoUrl;
      previous.photoUrl = profile?.photoUrl;
    }
  }

  if (Object.keys(requested).length === 0) {
    throw AppError.badRequest(
      'Nothing has changed. Edit at least one detail before submitting.',
    );
  }

  // One open ticket at a time. Two pending tickets could ask for conflicting changes,
  // and the office would have no way to know which the student meant.
  const open = await CorrectionRequestModel.findOne({
    studentId: student._id,
    status: CorrectionStatus.Pending,
  });

  if (open) {
    throw AppError.conflict(
      `You already have an open request, ticket ${open.ticketNumber}. Wait for it to be reviewed before raising another.`,
    );
  }

  // A student always has a college — the User schema refuses to save one without — but
  // Mongoose types the field as nullable because a university admin has none.
  const collegeRef = student.collegeId as Types.ObjectId;

  const request = await CorrectionRequestModel.create({
    collegeId: collegeRef,
    studentId: student._id,
    ticketNumber: await buildTicketNumber(collegeRef),
    requested,
    previous,
  });

  await request.populate(POPULATE_STUDENT);
  return toDetail(request);
}

/** A student's own tickets, newest first. */
export async function listMyCorrectionRequests(
  userId: Types.ObjectId,
): Promise<CorrectionRequestDetail[]> {
  const requests = (await CorrectionRequestModel.find({ studentId: userId })
    .populate(POPULATE_STUDENT)
    .sort({ createdAt: -1 })) as CorrectionRequestDocument[];

  return requests.map(toDetail);
}

/** The clerk's ticket queue for their own college. */
export async function listCorrectionRequests(
  collegeId: TenantScope | undefined,
  options: { status?: string } = {},
): Promise<CorrectionRequestDetail[]> {
  const filter: Record<string, unknown> = {};
  if (options.status) filter.status = options.status;

  const requests = (await CorrectionRequestModel.find(scopeFilter(filter, collegeId))
    .populate(POPULATE_STUDENT)
    // Oldest first: a queue should be worked in the order people joined it.
    .sort({ createdAt: 1 })) as CorrectionRequestDocument[];

  return requests.map(toDetail);
}

/** Loads a ticket a clerk may still act on. */
async function loadPendingRequest(
  id: string,
  collegeId: TenantScope | undefined,
): Promise<CorrectionRequestDocument> {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound('Request not found.');

  const request = (await CorrectionRequestModel.findOne(
    scopeFilter({ _id: new Types.ObjectId(id) }, collegeId),
  ).populate(POPULATE_STUDENT)) as CorrectionRequestDocument | null;

  if (!request) throw AppError.notFound('Request not found.');

  if (request.status !== CorrectionStatus.Pending) {
    throw AppError.conflict(
      `Ticket ${request.ticketNumber} has already been ${request.status}.`,
    );
  }

  return request;
}

/**
 * Approves a ticket and applies the change.
 *
 * This is the only path by which a student's name, date of birth or photograph changes.
 * The values are copied from the ticket rather than re-read from a request body, so what
 * the clerk saw on screen is exactly what gets written.
 */
export async function approveCorrectionRequest(
  id: string,
  collegeId: TenantScope | undefined,
  clerkId: Types.ObjectId,
): Promise<CorrectionRequestDetail> {
  const request = await loadPendingRequest(id, collegeId);

  const student = (await UserModel.findById(request.studentId)) as UserDocument | null;

  if (!student) throw AppError.notFound('Student not found.');

  /**
   * Mongoose types a nested sub-document as possibly absent and its optional fields as
   * `string | null | undefined`, so the values are narrowed once here rather than
   * repeating a guard on every assignment below.
   */
  const requested = (request.requested ?? {}) as {
    firstName?: string | null;
    middleName?: string | null;
    lastName?: string | null;
    dateOfBirth?: Date | null;
    photoUrl?: string | null;
  };

  if (requested.firstName) student.firstName = requested.firstName;
  if (requested.lastName) student.lastName = requested.lastName;

  if (requested.middleName !== undefined) {
    // An empty middle name is a legitimate correction — someone may genuinely be
    // removing one — so it is stored as null rather than treated as "no change".
    student.middleName = requested.middleName || null;
  }

  if (requested.dateOfBirth && student.studentProfile) {
    student.studentProfile.dateOfBirth = requested.dateOfBirth;
  }
  if (requested.photoUrl && student.studentProfile) {
    student.studentProfile.photoUrl = requested.photoUrl;
  }

  await student.save();

  request.status = CorrectionStatus.Approved;
  request.reviewedBy = clerkId;
  request.reviewedAt = new Date();
  await request.save();

  await request.populate(POPULATE_STUDENT);
  return toDetail(request);
}

/**
 * Declines a ticket with a reason.
 *
 * The reason is required for the same purpose as a rejected exam form: the student is the
 * only person who can act on it, and "declined" alone sends them back to the office to
 * ask what was missing.
 */
export async function declineCorrectionRequest(
  id: string,
  reason: string,
  collegeId: TenantScope | undefined,
  clerkId: Types.ObjectId,
): Promise<CorrectionRequestDetail> {
  const request = await loadPendingRequest(id, collegeId);

  request.status = CorrectionStatus.Rejected;
  request.reason = reason.trim();
  request.reviewedBy = clerkId;
  request.reviewedAt = new Date();
  await request.save();

  await request.populate(POPULATE_STUDENT);
  return toDetail(request);
}

/** Counts pending tickets, for the clerk's dashboard badge. */
export async function countPendingCorrections(
  collegeId: TenantScope | undefined,
): Promise<number> {
  requireScope(collegeId);

  return CorrectionRequestModel.countDocuments(
    scopeFilter({ status: CorrectionStatus.Pending }, collegeId),
  );
}
