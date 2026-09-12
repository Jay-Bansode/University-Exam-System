import { EntryType, ProgramType, Role } from '@ues/shared';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { CollegeModel } from '../models/college.model.js';
import { StreamModel } from '../models/stream.model.js';
import { SubjectModel } from '../models/subject.model.js';
import { ExamWindowModel } from '../models/exam-window.model.js';
import { CollegeStreamModel } from '../models/college-stream.model.js';
import { SemesterOfferingModel } from '../models/semester-offering.model.js';
import { ExamFormModel } from '../models/exam-form.model.js';
import { CorrectionRequestModel } from '../models/correction-request.model.js';
import { CounterModel } from '../models/counter.model.js';
import { UserModel } from '../models/user.model.js';
import { RefreshTokenModel } from '../models/refresh-token.model.js';
import { hashPassword } from '../services/auth.service.js';
import { env } from '../config/env.js';
import {
  SEED_CE_SUBJECTS,
  SEED_IT_SUBJECTS,
  SEED_STREAMS,
  seedExamWindows,
} from './syllabus-data.js';

/**
 * Seeds demo data.
 *
 * **Two colleges, not one.** A single-tenant seed would let a broken isolation rule pass
 * unnoticed, because there would be no second tenant's data to leak. With two, the
 * cross-tenant tests have something real to attempt, and a visitor can see for
 * themselves that one college's clerk cannot reach the other's students.
 *
 * Idempotent: it clears the collections it owns and rebuilds them, so it can be run
 * repeatedly during development without accumulating duplicates.
 *
 *   npm run seed
 */

const COLLEGES = [
  {
    name: "Mahatma Gandhi Mission's College of Engineering and Technology",
    code: 'MGMCET',
    city: 'Navi Mumbai',
    address: 'Sector 18, Kamothe, Navi Mumbai, Maharashtra',
    affiliationYear: 1984,
  },
  {
    name: 'Vidyalankar Institute of Technology',
    code: 'VIT',
    city: 'Mumbai',
    address: 'Wadala (East), Mumbai, Maharashtra',
    affiliationYear: 1999,
  },
] as const;

type StaffSpec = {
  role: Role;
  firstName: string;
  lastName: string;
};

/** One of each college-scoped staff role, per college. */
const STAFF_PER_COLLEGE: readonly StaffSpec[] = [
  { role: Role.CollegeAdmin, firstName: 'Anita', lastName: 'Deshmukh' },
  { role: Role.Faculty, firstName: 'Ramesh', lastName: 'Kulkarni' },
  { role: Role.Clerk, firstName: 'Sunil', lastName: 'Pawar' },
];

/**
 * Two students per college, one regular and one lateral entry, so the DSE semester rule
 * has real data behind it rather than only a unit test.
 */
const STUDENTS_PER_COLLEGE = [
  {
    firstName: 'Priya',
    middleName: 'Sanjay',
    lastName: 'Naik',
    entryType: EntryType.Regular,
    currentSemester: 5,
    rollNumber: 'CE21001',
  },
  {
    firstName: 'Imran',
    middleName: null,
    lastName: 'Shaikh',
    entryType: EntryType.Lateral,
    currentSemester: 3,
    rollNumber: 'CE22L07',
  },
] as const;

/** Builds a predictable demo address like `clerk.vit@demo.ues.test`. */
function demoEmail(role: Role, collegeCode: string | null): string {
  const suffix = collegeCode ? `.${collegeCode.toLowerCase()}` : '';
  return `${role.toLowerCase()}${suffix}@demo.ues.test`;
}

async function seed(): Promise<void> {
  await connectDatabase();

  /**
   * Every collection the seed owns, cleared together.
   *
   * The list must stay exhaustive. Exam forms, correction tickets and counters were once
   * missing from it, and the result was not an obvious failure: reseeding left orphaned
   * forms pointing at colleges that no longer existed. They vanished from any report that
   * grouped by college, but were still counted by one that grouped by semester — so two
   * tables on the same page disagreed, for reasons nothing in the code explained.
   *
   * Counters are included so form and ticket numbers restart at 1 on a fresh seed rather
   * than continuing from whatever the last run reached.
   */
  console.log('[seed] clearing existing data');
  await Promise.all([
    UserModel.deleteMany({}),
    CollegeModel.deleteMany({}),
    StreamModel.deleteMany({}),
    SubjectModel.deleteMany({}),
    ExamWindowModel.deleteMany({}),
    CollegeStreamModel.deleteMany({}),
    SemesterOfferingModel.deleteMany({}),
    ExamFormModel.deleteMany({}),
    CorrectionRequestModel.deleteMany({}),
    CounterModel.deleteMany({}),
    RefreshTokenModel.deleteMany({}),
  ]);

  // Hashed once and reused. bcrypt at cost 12 takes ~250ms, so hashing per user would
  // make the seed needlessly slow for no benefit — every demo account shares a password.
  const passwordHash = await hashPassword(env.SEED_DEMO_PASSWORD);

  const colleges = await CollegeModel.insertMany(
    COLLEGES.map((college) => ({ ...college, isActive: true })),
  );
  console.log(`[seed] created ${colleges.length} colleges`);

  /* ------------------------------------------- university-owned syllabus */

  // `create` rather than `insertMany`, so the pre-validate hook runs and derives
  // `totalSemesters` from each stream's programme type.
  const streams = await StreamModel.create([...SEED_STREAMS]);

  const beComputer = streams.find(
    (stream) => stream.code === 'CE' && stream.programType === ProgramType.BE,
  )!;
  const beIt = streams.find((stream) => stream.code === 'IT')!;

  const subjects = await SubjectModel.insertMany([
    ...SEED_CE_SUBJECTS.map((subject) => ({ ...subject, streamId: beComputer._id })),
    ...SEED_IT_SUBJECTS.map((subject) => ({ ...subject, streamId: beIt._id })),
  ]);

  const windows = await ExamWindowModel.create(seedExamWindows());

  console.log(
    `[seed] created ${streams.length} streams, ${subjects.length} subjects, ${windows.length} exam windows`,
  );

  /* --------------------------------------- which streams each college offers */

  // Both colleges offer Computer Engineering and IT. This is a join, not a copy: the
  // stream's name and semester count stay with the university.
  const collegeStreams = await CollegeStreamModel.insertMany(
    colleges.flatMap((college) =>
      [beComputer._id, beIt._id].map((streamId) => ({
        collegeId: college._id,
        streamId,
      })),
    ),
  );

  console.log(`[seed] linked ${collegeStreams.length} college-stream offerings`);

  /* ------------------------------- what each college teaches this semester */

  // Semester 5 Computer Engineering at both colleges, matching the exam window that is
  // open now. Semester 3 is deliberately left without an offering, so the "nothing is
  // offered yet" state is visible in the demo rather than only in an empty database.
  const semesterFiveSubjects = subjects
    .filter(
      (subject) =>
        String(subject.streamId) === String(beComputer._id) && subject.semester === 5,
    )
    .map((subject) => subject._id);

  const currentAcademicYear = windows[0]!.academicYear;

  const semesterOfferings = await SemesterOfferingModel.insertMany(
    colleges.map((college) => ({
      collegeId: college._id,
      streamId: beComputer._id,
      academicYear: currentAcademicYear,
      semester: 5,
      subjectIds: semesterFiveSubjects,
    })),
  );

  console.log(
    `[seed] created ${semesterOfferings.length} semester offerings (${semesterFiveSubjects.length} subjects each)`,
  );

  // The university admin is the only user with no college.
  await UserModel.create({
    email: demoEmail(Role.UniversityAdmin, null),
    passwordHash,
    firstName: 'Vikram',
    lastName: 'Joshi',
    role: Role.UniversityAdmin,
    collegeId: null,
    isDemo: true,
  });

  let staffCount = 0;
  let studentCount = 0;

  for (const college of colleges) {
    for (const spec of STAFF_PER_COLLEGE) {
      await UserModel.create({
        email: demoEmail(spec.role, college.code),
        passwordHash,
        firstName: spec.firstName,
        lastName: spec.lastName,
        role: spec.role,
        collegeId: college._id,
        isDemo: true,
      });
      staffCount += 1;
    }

    for (const [index, student] of STUDENTS_PER_COLLEGE.entries()) {
      await UserModel.create({
        // Only the first student of each college appears on the demo panel, to keep it
        // short; the second exists so search and listing have more than one row.
        email: `student${index + 1}.${college.code.toLowerCase()}@demo.ues.test`,
        passwordHash,
        firstName: student.firstName,
        middleName: student.middleName,
        lastName: student.lastName,
        role: Role.Student,
        collegeId: college._id,
        isDemo: index === 0,
        studentProfile: {
          rollNumber: student.rollNumber,
          programType: ProgramType.BE,
          entryType: student.entryType,
          currentSemester: student.currentSemester,
          // Every seeded student reads Computer Engineering, which is the stream whose
          // syllabus is populated — so their exam form has real subjects behind it.
          streamId: beComputer._id,
          dateOfBirth: new Date('2003-06-15'),
          photoUrl: null,
        },
      });
      studentCount += 1;
    }
  }

  console.log(
    `[seed] created 1 university admin, ${staffCount} staff, ${studentCount} students`,
  );
  console.log(`[seed] demo password: ${env.SEED_DEMO_PASSWORD}`);
  console.log('[seed] done');
}

seed()
  .then(() => disconnectDatabase())
  .then(() => process.exit(0))
  .catch(async (error: unknown) => {
    console.error('[seed] failed:', error);
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
  });
