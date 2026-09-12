import { ProgramType, SubjectType } from '@ues/shared';

/**
 * Seed syllabus, modelled on the University of Mumbai engineering curriculum.
 *
 * Codes follow the real convention — `CSC` for a Computer Science theory course, `CSL`
 * for its laboratory, the leading digit being the semester — so the demo data looks like
 * something a university actually published rather than "Subject 1, Subject 2".
 */

export const SEED_STREAMS = [
  { name: 'Computer Engineering', code: 'CE', programType: ProgramType.BE },
  { name: 'Information Technology', code: 'IT', programType: ProgramType.BE },
  { name: 'Mechanical Engineering', code: 'MECH', programType: ProgramType.BE },
  {
    name: 'Electronics and Telecommunication',
    code: 'EXTC',
    programType: ProgramType.BE,
  },
  { name: 'Computer Engineering', code: 'CE', programType: ProgramType.Diploma },
] as const;

type SeedSubject = {
  semester: number;
  name: string;
  code: string;
  credits: number;
  subjectType: SubjectType;
};

/**
 * Subjects for Computer Engineering (BE), semesters 3 and 5.
 *
 * Only two semesters are populated: enough for the seeded students — one regular in
 * semester 5, one lateral entry in semester 3 — to have a real syllabus, without
 * inventing eight semesters of plausible-looking filler.
 */
export const SEED_CE_SUBJECTS: SeedSubject[] = [
  // Semester 3 — where a Direct Second Year (lateral entry) student begins.
  {
    semester: 3,
    name: 'Engineering Mathematics III',
    code: 'CSC301',
    credits: 3,
    subjectType: SubjectType.Theory,
  },
  {
    semester: 3,
    name: 'Discrete Structures and Graph Theory',
    code: 'CSC302',
    credits: 3,
    subjectType: SubjectType.Theory,
  },
  {
    semester: 3,
    name: 'Data Structure and Analysis',
    code: 'CSC303',
    credits: 3,
    subjectType: SubjectType.Theory,
  },
  {
    semester: 3,
    name: 'Digital Logic and Computer Architecture',
    code: 'CSC304',
    credits: 3,
    subjectType: SubjectType.Theory,
  },
  {
    semester: 3,
    name: 'Computer Graphics',
    code: 'CSC305',
    credits: 3,
    subjectType: SubjectType.Theory,
  },
  {
    semester: 3,
    name: 'Data Structure Laboratory',
    code: 'CSL301',
    credits: 1,
    subjectType: SubjectType.Practical,
  },
  {
    semester: 3,
    name: 'Computer Graphics Laboratory',
    code: 'CSL303',
    credits: 1,
    subjectType: SubjectType.Practical,
  },

  // Semester 5.
  {
    semester: 5,
    name: 'Theoretical Computer Science',
    code: 'CSC501',
    credits: 3,
    subjectType: SubjectType.Theory,
  },
  {
    semester: 5,
    name: 'Software Engineering',
    code: 'CSC502',
    credits: 3,
    subjectType: SubjectType.Theory,
  },
  {
    semester: 5,
    name: 'Computer Network',
    code: 'CSC503',
    credits: 3,
    subjectType: SubjectType.Theory,
  },
  {
    semester: 5,
    name: 'Data Warehousing and Mining',
    code: 'CSC504',
    credits: 3,
    subjectType: SubjectType.Theory,
  },
  {
    semester: 5,
    name: 'Probabilistic Graphical Models',
    code: 'CSDLO5011',
    credits: 3,
    subjectType: SubjectType.Elective,
  },
  {
    semester: 5,
    name: 'Software Engineering Laboratory',
    code: 'CSL501',
    credits: 1,
    subjectType: SubjectType.Practical,
  },
  {
    semester: 5,
    name: 'Computer Network Laboratory',
    code: 'CSL502',
    credits: 1,
    subjectType: SubjectType.Practical,
  },
  {
    semester: 5,
    name: 'Mini Project 2A',
    code: 'CSM501',
    credits: 2,
    subjectType: SubjectType.Practical,
  },
];

/** A handful for IT semester 5, so the catalogue is not single-stream. */
export const SEED_IT_SUBJECTS: SeedSubject[] = [
  {
    semester: 5,
    name: 'Internet Programming',
    code: 'ITC501',
    credits: 3,
    subjectType: SubjectType.Theory,
  },
  {
    semester: 5,
    name: 'Computer Network Security',
    code: 'ITC502',
    credits: 3,
    subjectType: SubjectType.Theory,
  },
  {
    semester: 5,
    name: 'Advanced Data Management Technology',
    code: 'ITC503',
    credits: 3,
    subjectType: SubjectType.Theory,
  },
  {
    semester: 5,
    name: 'Internet Programming Laboratory',
    code: 'ITL501',
    credits: 1,
    subjectType: SubjectType.Practical,
  },
];

/**
 * Exam windows for the current academic year.
 *
 * The semester-5 window is deliberately open right now so the Phase 6 student flow can
 * be demonstrated the moment it exists. The semester-3 window is scheduled but still a
 * draft, which gives the UI a second state to show.
 */
export function seedExamWindows(now = new Date()) {
  const year = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const academicYear = `${year}-${String((year + 1) % 100).padStart(2, '0')}`;

  const day = 24 * 60 * 60 * 1000;

  return [
    {
      academicYear,
      semester: 5,
      openAt: new Date(now.getTime() - 7 * day),
      closeAt: new Date(now.getTime() + 21 * day),
      isPublished: true,
    },
    {
      academicYear,
      semester: 3,
      openAt: new Date(now.getTime() + 14 * day),
      closeAt: new Date(now.getTime() + 35 * day),
      isPublished: false,
    },
  ];
}
