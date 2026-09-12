import type { ProgramType } from './academics.js';

/**
 * Syllabus and exam-window contracts.
 *
 * All university-owned. Colleges read this catalogue but cannot change it — that split
 * is what makes an "affiliated university" different from a set of independent colleges.
 */

export const SubjectType = {
  Theory: 'theory',
  Practical: 'practical',
  Elective: 'elective',
} as const;

export type SubjectType = (typeof SubjectType)[keyof typeof SubjectType];

export const SUBJECT_TYPE_LABELS: Record<SubjectType, string> = {
  theory: 'Theory',
  practical: 'Practical',
  elective: 'Elective',
};

export type StreamDetail = {
  id: string;
  name: string;
  code: string;
  programType: ProgramType;
  totalSemesters: number;
  isActive: boolean;
  /** How many subjects the university has published for this stream. */
  subjectCount: number;
};

export type CreateStreamRequest = {
  name: string;
  code: string;
  programType: ProgramType;
};

export type UpdateStreamRequest = Partial<CreateStreamRequest> & { isActive?: boolean };

export type SubjectDetail = {
  id: string;
  streamId: string;
  streamName: string | null;
  semester: number;
  name: string;
  code: string;
  credits: number;
  subjectType: SubjectType;
  isActive: boolean;
};

export type CreateSubjectRequest = {
  streamId: string;
  semester: number;
  name: string;
  code: string;
  credits: number;
  subjectType: SubjectType;
};

export type UpdateSubjectRequest = Partial<Omit<CreateSubjectRequest, 'streamId'>> & {
  isActive?: boolean;
};

/**
 * A period during which colleges may accept exam forms for one semester.
 *
 * `isOpenNow` is computed by the server rather than in the browser. A client clock can be
 * wrong or deliberately changed, and whether registration is open is a rule the server
 * has to enforce anyway when a form is submitted.
 */
export type ExamWindowDetail = {
  id: string;
  academicYear: string;
  semester: number;
  openAt: string;
  closeAt: string;
  isPublished: boolean;
  isOpenNow: boolean;
  /** Human-readable reason when `isOpenNow` is false. */
  status: 'draft' | 'upcoming' | 'open' | 'closed';
};

export type CreateExamWindowRequest = {
  academicYear: string;
  semester: number;
  openAt: string;
  closeAt: string;
  isPublished?: boolean;
};

export type UpdateExamWindowRequest = Partial<CreateExamWindowRequest>;

/**
 * Academic years run July to June in Indian universities, so the label spans two
 * calendar years. Derived rather than free text, to stop `2026-27`, `2026-2027`, and
 * `26-27` all appearing in the same database.
 */
export function academicYearLabel(startYear: number): string {
  const endShort = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endShort}`;
}

export const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{2}$/;
