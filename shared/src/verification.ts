import type { ExamFormStatus } from './exam-form.js';

/**
 * The clerk's verification desk.
 *
 * A clerk checks a submitted form against the documents a student brings to the office,
 * then either verifies it or sends it back with a reason.
 */

/** A form as it appears in the clerk's queue — lighter than the full detail view. */
export type ExamFormSummary = {
  id: string;
  formNumber: string | null;
  status: ExamFormStatus;
  studentName: string;
  rollNumber: string;
  streamName: string;
  semester: number;
  academicYear: string;
  subjectCount: number;
  totalCredits: number;
  submittedAt: string | null;
  rejectionReason: string | null;
};

/** Counts per status, so the queue can show what is waiting without a second request. */
export type VerificationCounts = {
  submitted: number;
  verified: number;
  rejected: number;
  draft: number;
};

export type ExamFormQueueResponse = {
  forms: ExamFormSummary[];
  counts: VerificationCounts;
};

/**
 * Rejection always carries a reason.
 *
 * The student is the only person who can fix the form, and they cannot act on
 * "rejected" alone. Making the reason required by the schema means an unhelpful
 * rejection is impossible rather than merely discouraged.
 */
export type RejectFormRequest = {
  reason: string;
};
