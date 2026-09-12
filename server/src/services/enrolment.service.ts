import { Types } from 'mongoose';
import type {
  AddCollegeStreamRequest,
  CollegeStreamDetail,
  CreateUserRequest,
  CreateUserResponse,
  ManagedUser,
  UpdateUserRequest,
} from '@ues/shared';
import { EntryType, Role, isValidSemester, semesterRangeFor } from '@ues/shared';
import { CollegeStreamModel } from '../models/college-stream.model.js';
import { StreamModel } from '../models/stream.model.js';
import { UserModel, type UserDocument } from '../models/user.model.js';
import { RefreshTokenModel } from '../models/refresh-token.model.js';
import { AppError } from '../utils/app-error.js';
import { scopeFilter, requireScope, type TenantScope } from '../utils/scoped-query.js';
import { generateTemporaryPassword } from '../utils/password.js';
import { hashPassword } from './auth.service.js';
import { toManagedUser } from './user.mapper.js';

/**
 * The college admin's world: which streams this college offers, and the people in it.
 *
 * Every function takes a `TenantScope` and passes it through `scopeFilter` or
 * `requireScope`. Nothing here reads or writes without a college attached, which is why
 * a college admin physically cannot reach another college's records — the query to do so
 * cannot be constructed.
 */

type PopulatedStream = {
  _id: unknown;
  name?: string;
  code?: string;
  programType?: string;
  totalSemesters?: number;
};

/* --------------------------------------------------------- college streams */

/**
 * The streams this college offers, each with its student count.
 *
 * One aggregation for the counts rather than a query per stream, for the same reason as
 * elsewhere: the cost must not grow with the number of streams.
 */
export async function listCollegeStreams(
  collegeId: TenantScope | undefined,
): Promise<CollegeStreamDetail[]> {
  const scope = requireScope(collegeId);

  // A university admin has no single college to list streams for, and asking for one
  // would be ambiguous rather than merely unscoped.
  if (scope === null) {
    throw AppError.badRequest('Choose a college to view its streams.');
  }

  const collegeStreams = await CollegeStreamModel.find({ collegeId: scope }).populate(
    'streamId',
    'name code programType totalSemesters',
  );

  const counts = await UserModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { collegeId: scope, role: Role.Student } },
    { $group: { _id: '$studentProfile.streamId', count: { $sum: 1 } } },
  ]);

  const countByStream = new Map(counts.map((row) => [String(row._id), row.count]));

  return collegeStreams
    .map((entry) => {
      const stream = entry.streamId as unknown as PopulatedStream | null;
      if (!stream?.name) return null;

      return {
        id: String(entry._id),
        streamId: String(stream._id),
        streamName: stream.name,
        streamCode: stream.code ?? '',
        programType: stream.programType as CollegeStreamDetail['programType'],
        totalSemesters: stream.totalSemesters ?? 8,
        studentCount: countByStream.get(String(stream._id)) ?? 0,
      };
    })
    .filter((entry): entry is CollegeStreamDetail => entry !== null)
    .sort((a, b) => a.streamName.localeCompare(b.streamName));
}

export async function addCollegeStream(
  input: AddCollegeStreamRequest,
  collegeId: TenantScope | undefined,
): Promise<CollegeStreamDetail[]> {
  const scope = requireScope(collegeId);
  if (scope === null) throw AppError.badRequest('Choose a college first.');

  if (!Types.ObjectId.isValid(input.streamId)) {
    throw AppError.badRequest('That stream does not exist.', {
      streamId: ['Unknown stream'],
    });
  }

  const stream = await StreamModel.findById(input.streamId);
  if (!stream) {
    throw AppError.badRequest('That stream does not exist.', {
      streamId: ['Unknown stream'],
    });
  }

  if (!stream.isActive) {
    throw AppError.badRequest('That stream is no longer offered by the university.', {
      streamId: ['This stream is inactive'],
    });
  }

  const existing = await CollegeStreamModel.findOne({
    collegeId: scope,
    streamId: stream._id,
  });

  if (existing) {
    throw AppError.conflict('This college already offers that stream.');
  }

  await CollegeStreamModel.create({ collegeId: scope, streamId: stream._id });

  return listCollegeStreams(collegeId);
}

/**
 * Stops offering a stream.
 *
 * Refused while students are enrolled in it: removing it would leave them reading a
 * branch their college no longer claims to teach, and their exam forms would have no
 * syllabus behind them.
 */
export async function removeCollegeStream(
  id: string,
  collegeId: TenantScope | undefined,
): Promise<void> {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound('Stream not found.');

  const entry = await CollegeStreamModel.findOne(
    scopeFilter({ _id: new Types.ObjectId(id) }, collegeId),
  );

  // 404 rather than 403 for another college's record, as everywhere else.
  if (!entry) throw AppError.notFound('Stream not found.');

  const studentCount = await UserModel.countDocuments({
    collegeId: entry.collegeId,
    role: Role.Student,
    'studentProfile.streamId': entry.streamId,
  });

  if (studentCount > 0) {
    throw AppError.conflict(
      `${studentCount} student${studentCount === 1 ? ' is' : 's are'} enrolled in this stream. Move them before removing it.`,
    );
  }

  await entry.deleteOne();
}

/* ------------------------------------------------------------------ people */

/**
 * Validates a student's stream and semester together.
 *
 * Three rules that only make sense in combination:
 *   1. The stream must be one this college actually offers.
 *   2. The programme comes from the stream, so it cannot contradict it.
 *   3. The semester must be valid for that programme *and* entry type — a lateral-entry
 *      student begins at semester 3, so semesters 1 and 2 are not open to them.
 */
async function resolveEnrolment(
  scope: Types.ObjectId,
  streamId: string,
  entryType: EntryType,
  currentSemester: number,
) {
  if (!Types.ObjectId.isValid(streamId)) {
    throw AppError.badRequest('Choose a stream this college offers.', {
      'student.streamId': ['Unknown stream'],
    });
  }

  const offered = await CollegeStreamModel.findOne({
    collegeId: scope,
    streamId: new Types.ObjectId(streamId),
  });

  if (!offered) {
    throw AppError.badRequest('This college does not offer that stream.', {
      'student.streamId': ['Add the stream to this college first'],
    });
  }

  const stream = await StreamModel.findById(streamId);
  if (!stream) {
    throw AppError.badRequest('That stream does not exist.', {
      'student.streamId': ['Unknown stream'],
    });
  }

  if (!isValidSemester(currentSemester, stream.programType, entryType)) {
    const { min, max } = semesterRangeFor(stream.programType, entryType);
    const reason =
      entryType === EntryType.Lateral
        ? 'Direct Second Year students begin at semester 3'
        : `A ${stream.programType} programme runs to semester ${max}`;

    throw AppError.badRequest(reason, {
      'student.currentSemester': [`Must be between ${min} and ${max}`],
    });
  }

  return { streamId: stream._id, programType: stream.programType };
}

export async function createUser(
  input: CreateUserRequest,
  collegeId: TenantScope | undefined,
): Promise<CreateUserResponse> {
  const scope = requireScope(collegeId);
  if (scope === null) {
    throw AppError.badRequest('Choose a college before adding people to it.');
  }

  const email = input.email.toLowerCase().trim();

  // Email is globally unique because it is the login identifier, so this check spans
  // every college even though the caller can only see their own.
  const existing = await UserModel.findOne({ email });
  if (existing) {
    throw AppError.conflict('That email address is already registered.', {
      email: ['Already in use'],
    });
  }

  let studentProfile: Record<string, unknown> | undefined;

  if (input.role === Role.Student) {
    if (!input.student) {
      throw AppError.badRequest('Student details are required.', {
        'student.rollNumber': ['Required for a student'],
      });
    }

    const { streamId, programType } = await resolveEnrolment(
      scope,
      input.student.streamId,
      input.student.entryType,
      input.student.currentSemester,
    );

    const rollNumber = input.student.rollNumber.trim().toUpperCase();

    // Roll numbers repeat across colleges, so this is checked within the tenant only.
    const rollClash = await UserModel.findOne({
      collegeId: scope,
      'studentProfile.rollNumber': rollNumber,
    });

    if (rollClash) {
      throw AppError.conflict('That roll number is already used at this college.', {
        'student.rollNumber': ['Already in use'],
      });
    }

    studentProfile = {
      rollNumber,
      streamId,
      programType,
      entryType: input.student.entryType,
      currentSemester: input.student.currentSemester,
      dateOfBirth: input.student.dateOfBirth
        ? new Date(input.student.dateOfBirth)
        : undefined,
      photoUrl: null,
    };
  }

  const temporaryPassword = generateTemporaryPassword();

  const user = await UserModel.create({
    email,
    passwordHash: await hashPassword(temporaryPassword),
    firstName: input.firstName.trim(),
    middleName: input.middleName?.trim() || null,
    lastName: input.lastName.trim(),
    role: input.role,
    // The tenant comes from the token, never from the request body. A `collegeId` sent
    // by a client is simply not read.
    collegeId: scope,
    studentProfile,
  });

  await user.populate('studentProfile.streamId', 'name code');

  return { user: toManagedUser(user), temporaryPassword };
}

export async function updateUser(
  id: string,
  input: UpdateUserRequest,
  collegeId: TenantScope | undefined,
): Promise<ManagedUser> {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound('User not found.');

  const user = (await UserModel.findOne(
    scopeFilter({ _id: new Types.ObjectId(id) }, collegeId),
  )) as UserDocument | null;

  if (!user) throw AppError.notFound('User not found.');

  if (input.firstName !== undefined) user.firstName = input.firstName.trim();
  if (input.lastName !== undefined) user.lastName = input.lastName.trim();
  if (input.middleName !== undefined) user.middleName = input.middleName.trim() || null;

  if (input.student) {
    if (user.role !== Role.Student) {
      throw AppError.badRequest('Only a student has enrolment details.');
    }

    const profile = user.studentProfile!;
    const entryType = input.student.entryType ?? profile.entryType ?? EntryType.Regular;
    const semester = input.student.currentSemester ?? profile.currentSemester ?? 1;
    const streamId = input.student.streamId ?? String(profile.streamId);

    const resolved = await resolveEnrolment(
      user.collegeId as Types.ObjectId,
      streamId,
      entryType,
      semester,
    );

    profile.streamId = resolved.streamId;
    profile.programType = resolved.programType;
    profile.entryType = entryType;
    profile.currentSemester = semester;

    if (input.student.rollNumber) {
      const rollNumber = input.student.rollNumber.trim().toUpperCase();
      const clash = await UserModel.findOne({
        collegeId: user.collegeId,
        'studentProfile.rollNumber': rollNumber,
        _id: { $ne: user._id },
      });
      if (clash) {
        throw AppError.conflict('That roll number is already used at this college.', {
          'student.rollNumber': ['Already in use'],
        });
      }
      profile.rollNumber = rollNumber;
    }

    if (input.student.dateOfBirth) {
      profile.dateOfBirth = new Date(input.student.dateOfBirth);
    }
  }

  await user.save();
  await user.populate('studentProfile.streamId', 'name code');

  return toManagedUser(user);
}

/**
 * Activates or deactivates a person.
 *
 * Deactivating revokes their sessions immediately, for the same reason as deactivating a
 * college: blocking login alone would leave someone already signed in working for days.
 */
export async function setUserStatus(
  id: string,
  isActive: boolean,
  collegeId: TenantScope | undefined,
  actingUserId: Types.ObjectId,
): Promise<ManagedUser> {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound('User not found.');

  // Locking yourself out of your own college is never intentional.
  if (String(actingUserId) === id && !isActive) {
    throw AppError.badRequest('You cannot deactivate your own account.');
  }

  const user = (await UserModel.findOne(
    scopeFilter({ _id: new Types.ObjectId(id) }, collegeId),
  )) as UserDocument | null;

  if (!user) throw AppError.notFound('User not found.');

  user.isActive = isActive;
  await user.save();

  if (!isActive) {
    await RefreshTokenModel.updateMany(
      { userId: user._id, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }

  await user.populate('studentProfile.streamId', 'name code');
  return toManagedUser(user);
}

/**
 * Issues a fresh temporary password and ends every existing session for that person.
 *
 * Revoking sessions is the point: a password reset usually means the account may be
 * compromised, and leaving old refresh tokens valid would keep the intruder signed in.
 */
export async function resetUserPassword(
  id: string,
  collegeId: TenantScope | undefined,
): Promise<string> {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound('User not found.');

  const user = (await UserModel.findOne(
    scopeFilter({ _id: new Types.ObjectId(id) }, collegeId),
  )) as UserDocument | null;

  if (!user) throw AppError.notFound('User not found.');

  const temporaryPassword = generateTemporaryPassword();
  user.passwordHash = await hashPassword(temporaryPassword);
  await user.save();

  await RefreshTokenModel.updateMany(
    { userId: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );

  return temporaryPassword;
}
