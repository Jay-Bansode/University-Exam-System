import { Role } from '@ues/shared';

/**
 * Route paths, per-role landing pages, and the navigation each role sees.
 *
 * All three in one file because they have to agree: a link the navigation offers must be
 * a route the user's role is actually allowed to reach, or the guard bounces them
 * straight back. Keeping them apart is how that drifts.
 */

export const paths = {
  login: '/login',

  university: '/university',
  universityColleges: '/university/colleges',
  universitySyllabus: '/university/syllabus',
  universityExamWindows: '/university/exam-windows',
  universityStatistics: '/university/statistics',

  college: '/college',
  collegePeople: '/college/people',
  collegeStreams: '/college/streams',
  faculty: '/faculty',
  facultyOfferings: '/faculty/offerings',
  clerk: '/clerk',
  clerkVerification: '/clerk/verification',
  clerkCorrections: '/clerk/corrections',
  student: '/student',
  studentExamForm: '/student/exam-form',
  studentCorrections: '/student/corrections',
} as const;

export const HOME_FOR_ROLE: Record<Role, string> = {
  [Role.UniversityAdmin]: paths.university,
  [Role.CollegeAdmin]: paths.college,
  [Role.Faculty]: paths.faculty,
  [Role.Clerk]: paths.clerk,
  [Role.Student]: paths.student,
};

export type NavItem = { label: string; to: string };

export const NAV_FOR_ROLE: Record<Role, NavItem[]> = {
  [Role.UniversityAdmin]: [
    { label: 'Overview', to: paths.university },
    { label: 'Colleges', to: paths.universityColleges },
    { label: 'Syllabus', to: paths.universitySyllabus },
    { label: 'Exam windows', to: paths.universityExamWindows },
    { label: 'Statistics', to: paths.universityStatistics },
  ],
  // The remaining roles gain their own entries as later phases add pages. A single-item
  // navigation is hidden rather than rendered as a lone tab.
  [Role.CollegeAdmin]: [
    { label: 'Overview', to: paths.college },
    { label: 'People', to: paths.collegePeople },
    { label: 'Streams', to: paths.collegeStreams },
  ],
  [Role.Faculty]: [
    { label: 'Overview', to: paths.faculty },
    { label: 'Offerings', to: paths.facultyOfferings },
  ],
  [Role.Clerk]: [
    { label: 'Overview', to: paths.clerk },
    { label: 'Verification', to: paths.clerkVerification },
    { label: 'Corrections', to: paths.clerkCorrections },
  ],
  [Role.Student]: [
    { label: 'Overview', to: paths.student },
    { label: 'Exam form', to: paths.studentExamForm },
    { label: 'My details', to: paths.studentCorrections },
  ],
};
