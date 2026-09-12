/**
 * Cross-college statistics.
 *
 * The one view that reads across every tenant, and the reason the university tier exists
 * as more than a configuration screen: it is where "are colleges actually registering
 * their students?" gets answered.
 */

export type CollegeStatistics = {
  collegeId: string;
  collegeName: string;
  collegeCode: string;
  isActive: boolean;

  students: number;

  draft: number;
  submitted: number;
  verified: number;
  rejected: number;

  /**
   * Students with no form at all for the open semester.
   *
   * The most useful number on the page: a draft is a student who started, but this is a
   * student who has not, and they are the ones a college needs to chase before the
   * window closes.
   */
  notStarted: number;

  /** Verified as a percentage of students, rounded. */
  completionRate: number;
};

export type SemesterStatistics = {
  semester: number;
  draft: number;
  submitted: number;
  verified: number;
  rejected: number;
};

export type StatisticsResponse = {
  /** The semester these figures describe, taken from the open exam window. */
  academicYear: string | null;
  semesters: number[];

  totals: {
    colleges: number;
    activeColleges: number;
    students: number;
    draft: number;
    submitted: number;
    verified: number;
    rejected: number;
    notStarted: number;
  };

  byCollege: CollegeStatistics[];
  bySemester: SemesterStatistics[];
};
