import type { EntryType, ProgramType } from './academics.js';
import type { Role } from './roles.js';

/**
 * College-level people and programme management.
 *
 * Everything here is tenant-scoped: a college admin acts only within their own college,
 * and the server derives which college that is from the access token.
 */

/** A university stream that a particular college has chosen to offer. */
export type CollegeStreamDetail = {
  id: string;
  streamId: string;
  streamName: string;
  streamCode: string;
  programType: ProgramType;
  totalSemesters: number;
  /** How many of this college's students are enrolled in it. */
  studentCount: number;
};

export type AddCollegeStreamRequest = {
  streamId: string;
};

/** A person as the college admin's list view shows them. */
export type ManagedUser = {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  student: {
    rollNumber: string;
    programType: ProgramType;
    entryType: EntryType;
    currentSemester: number;
    streamId: string | null;
    streamName: string | null;
  } | null;
};

/**
 * Student-only fields on creation.
 *
 * `programType` is absent deliberately — it comes from the chosen stream, so asking for
 * it separately would let the two disagree.
 */
export type StudentEnrolment = {
  rollNumber: string;
  streamId: string;
  entryType: EntryType;
  currentSemester: number;
  dateOfBirth?: string;
};

/**
 * A college admin may create faculty, clerks and students, but never another college
 * admin — that stays with the university, so a tenant cannot expand its own
 * administration. The type expresses the rule; the server enforces it.
 */
export type CreatableRole = Extract<Role, 'faculty' | 'clerk' | 'student'>;

export type CreateUserRequest = {
  role: CreatableRole;
  email: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  student?: StudentEnrolment;
};

export type UpdateUserRequest = {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  student?: Partial<Omit<StudentEnrolment, 'streamId'>> & { streamId?: string };
};

/** Like a new college admin, the password is generated and shown exactly once. */
export type CreateUserResponse = {
  user: ManagedUser;
  temporaryPassword: string;
};

export type ResetPasswordResponse = {
  temporaryPassword: string;
};
