import { Types } from 'mongoose';
import type { OfferableSubject, OfferingDetail, SaveOfferingRequest } from '@ues/shared';
import { StreamModel } from '../models/stream.model.js';
import { SubjectModel, type SubjectDocument } from '../models/subject.model.js';
import { CollegeStreamModel } from '../models/college-stream.model.js';
import {
  SemesterOfferingModel,
  type SemesterOfferingDocument,
} from '../models/semester-offering.model.js';
import { ExamFormModel } from '../models/exam-form.model.js';
import { AppError } from '../utils/app-error.js';
import { requireScope, scopeFilter, type TenantScope } from '../utils/scoped-query.js';

/**
 * Semester offerings — what a college is actually teaching.
 *
 * The permission model here is the point of the whole phase. Faculty *compose* an
 * offering by selecting from the university's published subjects, so whatever they save
 * is necessarily a subset of an approved syllabus. There is no path from this service to
 * creating a subject, which is why "faculty cannot invent a subject" is a structural
 * property rather than a rule someone has to remember.
 */

type PopulatedStream = {
  _id: unknown;
  name?: string;
  code?: string;
  programType?: string;
  totalSemesters?: number;
};

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

function toOfferingDetail(offering: SemesterOfferingDocument): OfferingDetail {
  const stream = offering.streamId as unknown as PopulatedStream | null;
  const subjects = (offering.subjectIds as unknown as SubjectDocument[])
    .filter((subject) => subject && typeof subject === 'object' && 'code' in subject)
    .map(toOfferableSubject);

  return {
    id: String(offering._id),
    streamId: String(stream?._id ?? offering.streamId),
    streamName: stream?.name ?? '',
    streamCode: stream?.code ?? '',
    programType: stream?.programType as OfferingDetail['programType'],
    academicYear: offering.academicYear,
    semester: offering.semester,
    subjects,
    totalCredits: subjects.reduce((sum, subject) => sum + subject.credits, 0),
    updatedAt: offering.updatedAt.toISOString(),
  };
}

const POPULATE_OFFERING = [
  { path: 'streamId', select: 'name code programType totalSemesters' },
  { path: 'subjectIds', select: 'code name credits subjectType isActive' },
];

export async function listOfferings(
  collegeId: TenantScope | undefined,
  filter: { streamId?: string; semester?: number; academicYear?: string } = {},
): Promise<OfferingDetail[]> {
  const query: Record<string, unknown> = {};

  if (filter.streamId && Types.ObjectId.isValid(filter.streamId)) {
    query.streamId = new Types.ObjectId(filter.streamId);
  }
  if (filter.semester) query.semester = filter.semester;
  if (filter.academicYear) query.academicYear = filter.academicYear;

  const offerings = (await SemesterOfferingModel.find(scopeFilter(query, collegeId))
    .populate(POPULATE_OFFERING)
    .sort({ academicYear: -1, semester: 1 })) as SemesterOfferingDocument[];

  return offerings.map(toOfferingDetail);
}

/**
 * Validates that every chosen subject genuinely belongs to this stream and semester.
 *
 * The important failure this prevents is quiet rather than loud: a semester-3 subject
 * saved into a semester-5 offering would look fine in the database and only surface as a
 * student registering for a subject they are not taking. The ids are checked as a set,
 * so the error can name exactly which ones were wrong.
 */
async function resolveSubjects(
  streamId: Types.ObjectId,
  semester: number,
  subjectIds: string[],
): Promise<Types.ObjectId[]> {
  if (subjectIds.length === 0) {
    throw AppError.badRequest('Select at least one subject.', {
      subjectIds: ['An offering must contain at least one subject'],
    });
  }

  // Duplicates in the request would inflate the credit total without being visible.
  const unique = [...new Set(subjectIds)];
  if (unique.length !== subjectIds.length) {
    throw AppError.badRequest('The same subject was selected more than once.', {
      subjectIds: ['Remove the duplicates'],
    });
  }

  const objectIds = unique.map((id) => new Types.ObjectId(id));

  const subjects = await SubjectModel.find({
    _id: { $in: objectIds },
    streamId,
    semester,
  });

  if (subjects.length !== unique.length) {
    const found = new Set(subjects.map((subject) => String(subject._id)));
    const rejected = unique.filter((id) => !found.has(id));

    throw AppError.badRequest(
      `${rejected.length} selected subject${rejected.length === 1 ? ' does' : 's do'} not belong to this stream and semester.`,
      { subjectIds: ['Choose only subjects published for this semester'] },
    );
  }

  const retired = subjects.filter((subject) => !subject.isActive);
  if (retired.length > 0) {
    throw AppError.badRequest(
      `${retired.map((subject) => subject.code).join(', ')} ${retired.length === 1 ? 'has' : 'have'} been retired by the university.`,
      { subjectIds: ['Remove the retired subjects'] },
    );
  }

  return subjects.map((subject) => subject._id);
}

/** Confirms the college teaches this stream, and that the semester exists in it. */
async function resolveStream(
  scope: Types.ObjectId,
  streamId: string,
  semester: number,
): Promise<Types.ObjectId> {
  if (!Types.ObjectId.isValid(streamId)) {
    throw AppError.badRequest('Choose a stream this college offers.', {
      streamId: ['Unknown stream'],
    });
  }

  const offered = await CollegeStreamModel.findOne({
    collegeId: scope,
    streamId: new Types.ObjectId(streamId),
  });

  if (!offered) {
    throw AppError.badRequest('This college does not offer that stream.', {
      streamId: ['Add the stream to this college first'],
    });
  }

  const stream = await StreamModel.findById(streamId);
  if (!stream) {
    throw AppError.badRequest('That stream does not exist.', {
      streamId: ['Unknown stream'],
    });
  }

  const max = stream.totalSemesters ?? 8;
  if (semester > max) {
    throw AppError.badRequest(
      `${stream.name} is a ${stream.programType} programme with ${max} semesters.`,
      { semester: [`Must be between 1 and ${max}`] },
    );
  }

  return stream._id;
}

/**
 * Creates or replaces the offering for one stream, semester and academic year.
 *
 * Upsert rather than separate create and update endpoints: there is exactly one offering
 * per combination, so "save what this college teaches for semester 5" is a single
 * intention. Two endpoints would make the caller discover which one applies.
 */
export async function saveOffering(
  input: SaveOfferingRequest,
  collegeId: TenantScope | undefined,
  actingUserId: Types.ObjectId,
): Promise<OfferingDetail> {
  const scope = requireScope(collegeId);
  if (scope === null) {
    throw AppError.badRequest('Choose a college before saving an offering.');
  }

  const streamId = await resolveStream(scope, input.streamId, input.semester);
  const subjectIds = await resolveSubjects(streamId, input.semester, input.subjectIds);

  const existing = await SemesterOfferingModel.findOne({
    collegeId: scope,
    streamId,
    academicYear: input.academicYear,
    semester: input.semester,
  });

  if (existing) {
    await assertNoRegisteredSubjectRemoved(existing, subjectIds);
    existing.subjectIds = subjectIds;
    await existing.save();
    await existing.populate(POPULATE_OFFERING);
    return toOfferingDetail(existing);
  }

  const created = await SemesterOfferingModel.create({
    collegeId: scope,
    streamId,
    academicYear: input.academicYear,
    semester: input.semester,
    subjectIds,
    createdBy: actingUserId,
  });

  await created.populate(POPULATE_OFFERING);
  return toOfferingDetail(created);
}

/**
 * Refuses to withdraw a subject that students have already registered for.
 *
 * Adding subjects is always safe; removing one is not. A student's submitted form points
 * at subjects, and quietly dropping one from the offering would leave them registered for
 * an examination the college no longer claims to run.
 */
async function assertNoRegisteredSubjectRemoved(
  offering: SemesterOfferingDocument,
  nextSubjectIds: Types.ObjectId[],
): Promise<void> {
  const next = new Set(nextSubjectIds.map(String));
  const removed = (offering.subjectIds as Types.ObjectId[])
    .map(String)
    .filter((id) => !next.has(id));

  if (removed.length === 0) return;

  const registered = await ExamFormModel.find({
    offeringId: offering._id,
    subjectIds: { $in: removed.map((id) => new Types.ObjectId(id)) },
  }).select('subjectIds');

  if (registered.length === 0) return;

  const blocked = new Set<string>();
  for (const form of registered) {
    for (const id of form.subjectIds as Types.ObjectId[]) {
      if (removed.includes(String(id))) blocked.add(String(id));
    }
  }

  const codes = await SubjectModel.find({
    _id: { $in: [...blocked].map((id) => new Types.ObjectId(id)) },
  }).select('code');

  throw AppError.conflict(
    `${codes.map((subject) => subject.code).join(', ')} cannot be removed: ${registered.length} student${registered.length === 1 ? ' has' : 's have'} already registered for ${registered.length === 1 ? 'it' : 'them'}.`,
    { subjectIds: ['Students have registered for a subject you removed'] },
  );
}

/**
 * Deletes an offering entirely.
 *
 * Refused once any exam form references it, since those forms would be left pointing at
 * nothing.
 */
export async function deleteOffering(
  id: string,
  collegeId: TenantScope | undefined,
): Promise<void> {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound('Offering not found.');

  const offering = await SemesterOfferingModel.findOne(
    scopeFilter({ _id: new Types.ObjectId(id) }, collegeId),
  );

  if (!offering) throw AppError.notFound('Offering not found.');

  const formCount = await ExamFormModel.countDocuments({ offeringId: offering._id });
  if (formCount > 0) {
    throw AppError.conflict(
      `${formCount} exam form${formCount === 1 ? '' : 's'} reference this offering and it cannot be deleted.`,
    );
  }

  await offering.deleteOne();
}

/**
 * The subjects available to put in an offering: everything the university publishes for
 * this stream and semester.
 *
 * Faculty choose from this list and can do nothing else with it — there is no create
 * path here, which is exactly the constraint the phase exists to enforce.
 */
export async function listOfferableSubjects(
  streamId: string,
  semester: number,
  collegeId: TenantScope | undefined,
): Promise<OfferableSubject[]> {
  const scope = requireScope(collegeId);
  if (scope === null) throw AppError.badRequest('Choose a college first.');

  await resolveStream(scope, streamId, semester);

  const subjects = (await SubjectModel.find({
    streamId: new Types.ObjectId(streamId),
    semester,
  }).sort({ code: 1 })) as SubjectDocument[];

  return subjects.map(toOfferableSubject);
}
