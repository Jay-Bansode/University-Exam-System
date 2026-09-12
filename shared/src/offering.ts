import type { ProgramType } from './academics.js';
import type { SubjectType } from './syllabus.js';

/**
 * Semester offerings: the subjects one college is actually running for one stream,
 * semester and academic year.
 *
 * This is where the university's catalogue meets a college's timetable. Faculty compose
 * an offering by selecting from published subjects; they cannot invent one, so the
 * offering is always a subset of what the university approved.
 */

/** A subject as it appears when choosing what to offer. */
export type OfferableSubject = {
  id: string;
  code: string;
  name: string;
  credits: number;
  subjectType: SubjectType;
  isActive: boolean;
};

export type OfferingDetail = {
  id: string;
  streamId: string;
  streamName: string;
  streamCode: string;
  programType: ProgramType;
  academicYear: string;
  semester: number;
  subjects: OfferableSubject[];
  totalCredits: number;
  updatedAt: string;
};

export type SaveOfferingRequest = {
  streamId: string;
  academicYear: string;
  semester: number;
  subjectIds: string[];
};

export type UpdateOfferingRequest = {
  subjectIds: string[];
};
