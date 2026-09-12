import { Types } from 'mongoose';
import type {
  CreateStreamRequest,
  CreateSubjectRequest,
  StreamDetail,
  SubjectDetail,
  UpdateStreamRequest,
  UpdateSubjectRequest,
} from '@ues/shared';
import { TOTAL_SEMESTERS } from '@ues/shared';
import { StreamModel, type StreamDocument } from '../models/stream.model.js';
import { SubjectModel, type SubjectDocument } from '../models/subject.model.js';
import { SemesterOfferingModel } from '../models/semester-offering.model.js';
import { UserModel } from '../models/user.model.js';
import { AppError } from '../utils/app-error.js';

/**
 * The university's master syllabus: streams and the subjects within them.
 *
 * Reads are open to any signed-in user — the syllabus is public information inside the
 * university, and faculty and students both need it. Writes are university-admin only,
 * enforced at the route layer.
 */

function toStreamDetail(stream: StreamDocument, subjectCount = 0): StreamDetail {
  return {
    id: String(stream._id),
    name: stream.name,
    code: stream.code,
    programType: stream.programType,
    totalSemesters: stream.totalSemesters ?? TOTAL_SEMESTERS[stream.programType],
    isActive: stream.isActive,
    subjectCount,
  };
}

function toSubjectDetail(subject: SubjectDocument): SubjectDetail {
  const stream = subject.streamId as unknown as { _id: unknown; name?: string } | null;

  return {
    id: String(subject._id),
    streamId: String(stream?._id ?? subject.streamId),
    streamName: stream?.name ?? null,
    semester: subject.semester,
    name: subject.name,
    code: subject.code,
    credits: subject.credits,
    subjectType: subject.subjectType,
    isActive: subject.isActive,
  };
}

/* ------------------------------------------------------------------ streams */

/**
 * Lists streams with a subject count each.
 *
 * One aggregation for the counts rather than a query per stream, for the same reason as
 * the college headcounts: the cost must not grow with the number of streams.
 */
export async function listStreams(): Promise<StreamDetail[]> {
  const streams = await StreamModel.find().sort({ programType: 1, name: 1 });

  const counts = await SubjectModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $group: { _id: '$streamId', count: { $sum: 1 } } },
  ]);

  const countByStream = new Map(counts.map((row) => [String(row._id), row.count]));

  return streams.map((stream) =>
    toStreamDetail(stream, countByStream.get(String(stream._id)) ?? 0),
  );
}

export async function createStream(input: CreateStreamRequest): Promise<StreamDetail> {
  const code = input.code.toUpperCase();

  const existing = await StreamModel.findOne({ code, programType: input.programType });
  if (existing) {
    throw AppError.conflict(
      `A ${input.programType} stream with code ${code} already exists.`,
      { code: ['This code is already used for this programme'] },
    );
  }

  const stream = await StreamModel.create({ ...input, code });
  return toStreamDetail(stream);
}

export async function updateStream(
  id: string,
  input: UpdateStreamRequest,
): Promise<StreamDetail> {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound('Stream not found.');

  const stream = await StreamModel.findById(id);
  if (!stream) throw AppError.notFound('Stream not found.');

  /**
   * Changing the programme changes how many semesters the stream has. A BE has eight and
   * a Diploma six, so switching BE to Diploma would strand any subject already published
   * for semesters 7 or 8 in a semester that no longer exists.
   */
  if (input.programType && input.programType !== stream.programType) {
    const newMax = TOTAL_SEMESTERS[input.programType];
    const beyond = await SubjectModel.countDocuments({
      streamId: stream._id,
      semester: { $gt: newMax },
    });

    if (beyond > 0) {
      throw AppError.conflict(
        `Cannot change to ${input.programType}: ${beyond} subject${beyond === 1 ? ' is' : 's are'} published for a semester beyond ${newMax}.`,
        { programType: ['Remove those subjects first'] },
      );
    }
  }

  Object.assign(stream, input);
  if (input.code) stream.code = input.code.toUpperCase();
  await stream.save();

  return toStreamDetail(stream);
}

/**
 * Deletes a stream, but only when nothing references it.
 *
 * Both dependencies are checked, because either one would be orphaned: a subject would
 * point at a missing stream, and a student's profile would lose their branch entirely.
 */
export async function deleteStream(id: string): Promise<void> {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound('Stream not found.');

  const stream = await StreamModel.findById(id);
  if (!stream) throw AppError.notFound('Stream not found.');

  const [subjectCount, studentCount] = await Promise.all([
    SubjectModel.countDocuments({ streamId: stream._id }),
    UserModel.countDocuments({ 'studentProfile.streamId': stream._id }),
  ]);

  if (subjectCount > 0) {
    throw AppError.conflict(
      `${stream.name} has ${subjectCount} subject${subjectCount === 1 ? '' : 's'}. Remove them first, or deactivate the stream instead.`,
    );
  }

  if (studentCount > 0) {
    throw AppError.conflict(
      `${stream.name} has ${studentCount} enrolled student${studentCount === 1 ? '' : 's'}. Deactivate it instead.`,
    );
  }

  await stream.deleteOne();
}

/* ----------------------------------------------------------------- subjects */

export async function listSubjects(filter: {
  streamId?: string;
  semester?: number;
}): Promise<SubjectDetail[]> {
  const query: Record<string, unknown> = {};

  if (filter.streamId) {
    if (!Types.ObjectId.isValid(filter.streamId)) return [];
    query.streamId = new Types.ObjectId(filter.streamId);
  }

  if (filter.semester) query.semester = filter.semester;

  const subjects = (await SubjectModel.find(query)
    .populate('streamId', 'name code')
    .sort({ semester: 1, code: 1 })) as SubjectDocument[];

  return subjects.map(toSubjectDetail);
}

/** Rejects a semester that does not exist in the stream's programme. */
async function assertSemesterExists(
  streamId: Types.ObjectId,
  semester: number,
): Promise<void> {
  const stream = await StreamModel.findById(streamId);
  if (!stream) {
    throw AppError.badRequest('That stream does not exist.', {
      streamId: ['Unknown stream'],
    });
  }

  const max = stream.totalSemesters ?? TOTAL_SEMESTERS[stream.programType];
  if (semester > max) {
    throw AppError.badRequest(
      `${stream.name} is a ${stream.programType} programme with ${max} semesters.`,
      { semester: [`Must be between 1 and ${max}`] },
    );
  }
}

export async function createSubject(input: CreateSubjectRequest): Promise<SubjectDetail> {
  if (!Types.ObjectId.isValid(input.streamId)) {
    throw AppError.badRequest('That stream does not exist.', {
      streamId: ['Unknown stream'],
    });
  }

  const streamId = new Types.ObjectId(input.streamId);
  await assertSemesterExists(streamId, input.semester);

  const code = input.code.toUpperCase();
  const existing = await SubjectModel.findOne({ streamId, code });
  if (existing) {
    throw AppError.conflict(
      `A subject with code ${code} already exists in this stream.`,
      {
        code: ['This code is already in use'],
      },
    );
  }

  const subject = await SubjectModel.create({ ...input, streamId, code });
  await subject.populate('streamId', 'name code');

  return toSubjectDetail(subject);
}

export async function updateSubject(
  id: string,
  input: UpdateSubjectRequest,
): Promise<SubjectDetail> {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound('Subject not found.');

  const subject = await SubjectModel.findById(id);
  if (!subject) throw AppError.notFound('Subject not found.');

  if (input.semester && input.semester !== subject.semester) {
    await assertSemesterExists(subject.streamId as Types.ObjectId, input.semester);
  }

  if (input.code && input.code.toUpperCase() !== subject.code) {
    const clash = await SubjectModel.findOne({
      streamId: subject.streamId,
      code: input.code.toUpperCase(),
      _id: { $ne: subject._id },
    });
    if (clash) {
      throw AppError.conflict('A subject with that code already exists in this stream.', {
        code: ['This code is already in use'],
      });
    }
  }

  Object.assign(subject, input);
  if (input.code) subject.code = input.code.toUpperCase();
  await subject.save();
  await subject.populate('streamId', 'name code');

  return toSubjectDetail(subject);
}

/**
 * Deletes a subject, unless a college is already running it.
 *
 * A `SemesterOffering` holding this id would be left pointing at nothing, and the exam
 * forms built from that offering would lose the subject they were registered for.
 * Deactivating retires a subject from future syllabi while keeping past records intact.
 */
export async function deleteSubject(id: string): Promise<void> {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound('Subject not found.');

  const subject = await SubjectModel.findById(id);
  if (!subject) throw AppError.notFound('Subject not found.');

  const offeringCount = await SemesterOfferingModel.countDocuments({
    subjectIds: subject._id,
  });

  if (offeringCount > 0) {
    throw AppError.conflict(
      `${subject.code} is in use by ${offeringCount} college offering${offeringCount === 1 ? '' : 's'} and cannot be deleted. Deactivate it instead.`,
    );
  }

  await subject.deleteOne();
}
