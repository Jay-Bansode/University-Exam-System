/**
 * The five roles in the system.
 *
 * Declared as a frozen object plus a derived union type rather than a TS `enum`.
 * A TS `enum` emits real runtime JavaScript, which breaks Node's type-stripping and
 * bundler `isolatedModules` assumptions. This pattern gives the same ergonomics with
 * a plain object at runtime.
 */
export const Role = {
  UniversityAdmin: 'universityAdmin',
  CollegeAdmin: 'collegeAdmin',
  Faculty: 'faculty',
  Clerk: 'clerk',
  Student: 'student',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const ALL_ROLES: readonly Role[] = Object.values(Role);

/**
 * Roles whose data is confined to a single college. A university admin is deliberately
 * absent: it is the only role permitted to read across tenants.
 */
export const TENANT_SCOPED_ROLES: readonly Role[] = [
  Role.CollegeAdmin,
  Role.Faculty,
  Role.Clerk,
  Role.Student,
];

export function isTenantScopedRole(role: Role): boolean {
  return TENANT_SCOPED_ROLES.includes(role);
}

/** Human-readable labels for UI display. */
export const ROLE_LABELS: Record<Role, string> = {
  universityAdmin: 'University Admin',
  collegeAdmin: 'College Admin',
  faculty: 'Faculty',
  clerk: 'Clerk',
  student: 'Student',
};
