import type {
  AuthUser,
  CollegeSummary,
  ManagedUser,
  StudentProfileSummary,
} from '@ues/shared';
import { EntryType, Role } from '@ues/shared';
import type { UserDocument } from '../models/user.model.js';
import { formatFullName } from '../utils/names.js';

/**
 * Converts a User document into the shape the client is allowed to see.
 *
 * Every response containing a user goes through here. That is the point: it is an
 * allowlist, so a field added to the schema later is invisible to clients until someone
 * deliberately adds it below. The opposite approach — deleting sensitive keys from the
 * document — leaks by default the moment a new sensitive field appears.
 */

type PopulatedCollege = {
  _id: unknown;
  name?: string;
  code?: string;
};

type PopulatedStream = {
  _id: unknown;
  name?: string;
};

function toCollegeSummary(value: unknown): CollegeSummary | null {
  if (!value || typeof value !== 'object') return null;

  const college = value as PopulatedCollege;
  // An unpopulated ref is just an ObjectId and has no `name`; there is nothing to show.
  if (!college.name) return null;

  return {
    id: String(college._id),
    name: college.name,
    code: college.code ?? '',
  };
}

function toStudentProfile(user: UserDocument): StudentProfileSummary | null {
  if (user.role !== Role.Student || !user.studentProfile) return null;

  const profile = user.studentProfile;
  const stream = profile.streamId as unknown;
  const populatedStream =
    stream && typeof stream === 'object' && 'name' in stream
      ? (stream as PopulatedStream)
      : null;

  return {
    rollNumber: profile.rollNumber ?? '',
    programType: profile.programType!,
    entryType: profile.entryType!,
    currentSemester: profile.currentSemester ?? 1,
    streamId: profile.streamId ? String(populatedStream?._id ?? profile.streamId) : null,
    streamName: populatedStream?.name ?? null,
    photoUrl: profile.photoUrl ?? null,
  };
}

export function toAuthUser(user: UserDocument): AuthUser {
  return {
    id: String(user._id),
    email: user.email,
    firstName: user.firstName,
    middleName: user.middleName ?? null,
    lastName: user.lastName,
    fullName: formatFullName(user),
    role: user.role,
    college: toCollegeSummary(user.collegeId),
    studentProfile: toStudentProfile(user),
  };
}

/**
 * The administrative view of a person, used by both the college roster and the shared
 * `/users` listing.
 *
 * Differs from `AuthUser` in audience rather than sensitivity: `AuthUser` is what someone
 * is told about *themselves*, while this is what a college admin is told about *someone
 * else* — hence `isActive` and `lastLoginAt`, and no college block, since every person in
 * a roster already belongs to the caller's own college.
 */
export function toManagedUser(user: UserDocument): ManagedUser {
  const profile = user.studentProfile;
  const stream = profile?.streamId as unknown as PopulatedStream | null;

  return {
    id: String(user._id),
    email: user.email,
    fullName: formatFullName(user),
    firstName: user.firstName,
    middleName: user.middleName ?? null,
    lastName: user.lastName,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    student:
      user.role === Role.Student && profile
        ? {
            rollNumber: profile.rollNumber ?? '',
            programType: profile.programType!,
            entryType: profile.entryType ?? EntryType.Regular,
            currentSemester: profile.currentSemester ?? 1,
            streamId: profile.streamId ? String(stream?._id ?? profile.streamId) : null,
            streamName: stream?.name ?? null,
          }
        : null,
  };
}
