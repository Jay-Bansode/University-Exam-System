import type { Role } from './roles.js';
import type { EntryType, ProgramType } from './academics.js';

/**
 * Auth contracts shared by both sides.
 *
 * Defining these once means a rename on the server becomes a compile error in the
 * client, rather than a runtime surprise nobody notices until a page renders blank.
 */

/** The college a user belongs to, flattened for display. Null for a university admin. */
export type CollegeSummary = {
  id: string;
  name: string;
  code: string;
};

/** Student-only fields. Absent on every other role. */
export type StudentProfileSummary = {
  rollNumber: string;
  programType: ProgramType;
  entryType: EntryType;
  currentSemester: number;
  streamId: string | null;
  streamName: string | null;
  photoUrl: string | null;
};

/**
 * The authenticated user as the client sees them.
 *
 * Deliberately excludes the password hash and every token. This type is what the server
 * is allowed to disclose about a user to that same user.
 */
export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  fullName: string;
  role: Role;
  college: CollegeSummary | null;
  studentProfile: StudentProfileSummary | null;
};

export type LoginRequest = {
  email: string;
  password: string;
};

/**
 * The refresh token is intentionally absent: it travels only as an httpOnly cookie, so
 * page JavaScript can never read it and an XSS bug cannot exfiltrate a long-lived
 * credential. The access token is short-lived and held in memory only.
 */
export type LoginResponse = {
  user: AuthUser;
  accessToken: string;
  /** Seconds until `accessToken` expires, so the client can refresh proactively. */
  expiresIn: number;
};

export type RefreshResponse = {
  accessToken: string;
  expiresIn: number;
};

/**
 * One entry on the public demo login panel.
 *
 * This is the single place a password legitimately crosses the wire in a response, and
 * it is safe only because the endpoint serving it returns *nothing but* accounts flagged
 * `isDemo` in the database. Those accounts exist so a recruiter can explore the system
 * without credentials, and they are seeded, disposable, and publicly known by design.
 * A real account is never listed here.
 */
export type DemoAccount = {
  email: string;
  password: string;
  role: Role;
  label: string;
  collegeName: string | null;
};
