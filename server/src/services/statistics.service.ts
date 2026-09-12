import type { Types } from 'mongoose';
import type {
  CollegeStatistics,
  SemesterStatistics,
  StatisticsResponse,
} from '@ues/shared';
import { ExamFormStatus, Role } from '@ues/shared';
import { CollegeModel } from '../models/college.model.js';
import { UserModel } from '../models/user.model.js';
import { ExamFormModel } from '../models/exam-form.model.js';
import { ExamWindowModel } from '../models/exam-window.model.js';

/**
 * Cross-college statistics for the university tier.
 *
 * Deliberately unscoped — this is the one place that reads across every tenant, and the
 * route guard restricting it to a university admin is the only thing standing between
 * it and the isolation the rest of the system enforces.
 *
 * **Three aggregations, not three-per-college.** Every figure below comes from a fixed
 * number of round trips regardless of how many colleges exist. With Mumbai University's
 * real affiliate count the naive per-college approach would be hundreds of queries for
 * one page.
 */

type StatusCounts = {
  draft: number;
  submitted: number;
  verified: number;
  rejected: number;
};

const EMPTY_COUNTS: StatusCounts = {
  draft: 0,
  submitted: 0,
  verified: 0,
  rejected: 0,
};

/**
 * Which semesters to report on.
 *
 * Taken from the exam windows the university has published rather than from every
 * semester that exists, because a semester nobody is registering for has nothing to say.
 */
async function resolveReportingWindow(): Promise<{
  academicYear: string | null;
  semesters: number[];
}> {
  const published = await ExamWindowModel.find({ isPublished: true })
    .sort({ academicYear: -1 })
    .select('academicYear semester');

  if (published.length === 0) return { academicYear: null, semesters: [] };

  // The most recent academic year that has any published window.
  const academicYear = published[0]!.academicYear;

  const semesters = [
    ...new Set(
      published
        .filter((window) => window.academicYear === academicYear)
        .map((window) => window.semester),
    ),
  ].sort((a, b) => a - b);

  return { academicYear, semesters };
}

export async function getStatistics(): Promise<StatisticsResponse> {
  const { academicYear, semesters } = await resolveReportingWindow();

  const formMatch: Record<string, unknown> = {};
  if (academicYear) formMatch.academicYear = academicYear;
  if (semesters.length > 0) formMatch.semester = { $in: semesters };

  const [colleges, studentRows, formRows, semesterRows] = await Promise.all([
    CollegeModel.find().sort({ name: 1 }),

    // Students per college, limited to the semesters being reported on — a student in
    // semester 2 is not expected to have a semester-5 form, so counting them would
    // depress every figure for no reason.
    UserModel.aggregate<{ _id: Types.ObjectId; count: number }>([
      {
        $match: {
          role: Role.Student,
          collegeId: { $ne: null },
          ...(semesters.length > 0
            ? { 'studentProfile.currentSemester': { $in: semesters } }
            : {}),
        },
      },
      { $group: { _id: '$collegeId', count: { $sum: 1 } } },
    ]),

    // Forms grouped by college and status, in one pass.
    ExamFormModel.aggregate<{
      _id: { collegeId: Types.ObjectId; status: string };
      count: number;
    }>([
      { $match: formMatch },
      {
        $group: {
          _id: { collegeId: '$collegeId', status: '$status' },
          count: { $sum: 1 },
        },
      },
    ]),

    // The same forms grouped by semester instead, for the second table.
    ExamFormModel.aggregate<{
      _id: { semester: number; status: string };
      count: number;
    }>([
      { $match: formMatch },
      {
        $group: {
          _id: { semester: '$semester', status: '$status' },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const studentsByCollege = new Map(
    studentRows.map((row) => [String(row._id), row.count]),
  );

  const formsByCollege = new Map<string, StatusCounts>();
  for (const row of formRows) {
    const key = String(row._id.collegeId);
    const counts = formsByCollege.get(key) ?? { ...EMPTY_COUNTS };

    if (row._id.status in counts) {
      counts[row._id.status as keyof StatusCounts] = row.count;
    }

    formsByCollege.set(key, counts);
  }

  const byCollege: CollegeStatistics[] = colleges.map((college) => {
    const key = String(college._id);
    const students = studentsByCollege.get(key) ?? 0;
    const counts = formsByCollege.get(key) ?? { ...EMPTY_COUNTS };

    const withAnyForm =
      counts.draft + counts.submitted + counts.verified + counts.rejected;

    return {
      collegeId: key,
      collegeName: college.name,
      collegeCode: college.code,
      isActive: college.isActive,
      students,
      ...counts,
      // Clamped at zero: a student could in principle hold a form for a semester they
      // have since moved on from, which would otherwise produce a negative figure.
      notStarted: Math.max(students - withAnyForm, 0),
      completionRate: students === 0 ? 0 : Math.round((counts.verified / students) * 100),
    };
  });

  const bySemesterMap = new Map<number, StatusCounts>();
  for (const row of semesterRows) {
    const counts = bySemesterMap.get(row._id.semester) ?? { ...EMPTY_COUNTS };

    if (row._id.status in counts) {
      counts[row._id.status as keyof StatusCounts] = row.count;
    }

    bySemesterMap.set(row._id.semester, counts);
  }

  const bySemester: SemesterStatistics[] = [...bySemesterMap.entries()]
    .map(([semester, counts]) => ({ semester, ...counts }))
    .sort((a, b) => a.semester - b.semester);

  const totals = byCollege.reduce(
    (accumulator, college) => ({
      colleges: accumulator.colleges + 1,
      activeColleges: accumulator.activeColleges + (college.isActive ? 1 : 0),
      students: accumulator.students + college.students,
      draft: accumulator.draft + college.draft,
      submitted: accumulator.submitted + college.submitted,
      verified: accumulator.verified + college.verified,
      rejected: accumulator.rejected + college.rejected,
      notStarted: accumulator.notStarted + college.notStarted,
    }),
    {
      colleges: 0,
      activeColleges: 0,
      students: 0,
      draft: 0,
      submitted: 0,
      verified: 0,
      rejected: 0,
      notStarted: 0,
    },
  );

  return { academicYear, semesters, totals, byCollege, bySemester };
}

/** Kept for the exhaustiveness of the status list the aggregation buckets into. */
export const REPORTED_STATUSES = [
  ExamFormStatus.Draft,
  ExamFormStatus.Submitted,
  ExamFormStatus.Verified,
  ExamFormStatus.Rejected,
] as const;
