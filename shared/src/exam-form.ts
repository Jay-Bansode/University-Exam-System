import type { EntryType, ProgramType } from './academics.js';
import type { OfferableSubject } from './offering.js';
import type { ExamWindowDetail } from './syllabus.js';

/**
 * The exam form: a student's registration for one semester's examinations.
 *
 * This is the system's central document. Everything before it exists to make it
 * possible — the university publishes a syllabus, a college offers a subset of it, and a
 * student registers for a subset of that.
 */

export const ExamFormStatus = {
  Draft: 'draft',
  Submitted: 'submitted',
  Verified: 'verified',
  Rejected: 'rejected',
} as const;

export type ExamFormStatus = (typeof ExamFormStatus)[keyof typeof ExamFormStatus];

export const EXAM_FORM_STATUS_LABELS: Record<ExamFormStatus, string> = {
  draft: 'Draft',
  submitted: 'Awaiting verification',
  verified: 'Verified',
  rejected: 'Rejected',
};

/** A form is editable only while it is a draft, or after a clerk sends it back. */
export function isEditableStatus(status: ExamFormStatus): boolean {
  return status === ExamFormStatus.Draft || status === ExamFormStatus.Rejected;
}

/** The student's details as printed on the form. Captured, not looked up live. */
export type ExamFormStudent = {
  id: string;
  fullName: string;
  rollNumber: string;
  programType: ProgramType;
  entryType: EntryType;
  photoUrl: string | null;
};

export type ExamFormDetail = {
  id: string;
  formNumber: string | null;
  status: ExamFormStatus;

  student: ExamFormStudent;
  collegeName: string;
  collegeCode: string;
  streamName: string;
  streamCode: string;

  academicYear: string;
  semester: number;

  subjects: OfferableSubject[];
  totalCredits: number;

  submittedAt: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  updatedAt: string;
};

/**
 * Why a student cannot submit right now.
 *
 * A discriminated reason rather than a boolean, so the page can explain the specific
 * obstacle — "your college has not published subjects yet" and "registration closed on
 * Friday" need different words and different next steps.
 */
export const SubmissionBlock = {
  NoOffering: 'no-offering',
  NoWindow: 'no-window',
  WindowNotOpen: 'window-not-open',
  AlreadySubmitted: 'already-submitted',
  NoSubjects: 'no-subjects',
} as const;

export type SubmissionBlock = (typeof SubmissionBlock)[keyof typeof SubmissionBlock];

/**
 * Everything the student's exam-form page needs, in one request.
 *
 * Combined deliberately: the page cannot render anything useful without knowing all
 * three of the form, the offering and the window, and three round trips would show three
 * separate loading states for one screen.
 */
export type MyExamFormResponse = {
  form: ExamFormDetail | null;
  /** The subjects the college is running for this student's semester. */
  availableSubjects: OfferableSubject[];
  window: ExamWindowDetail | null;
  academicYear: string;
  semester: number;
  canEdit: boolean;
  canSubmit: boolean;
  block: SubmissionBlock | null;
};

export type SaveDraftRequest = {
  subjectIds: string[];
};

export type SubmitFormRequest = {
  subjectIds: string[];
};
