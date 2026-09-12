/**
 * Correction requests.
 *
 * A student cannot edit their own name, date of birth or photograph directly — those
 * appear on a marksheet, so changing them is an administrative act that needs evidence.
 * Instead the student raises a ticket, brings documents to the college office, and a
 * clerk approves or declines it.
 *
 * This is the one workflow where the system deliberately refuses to be self-service.
 */

export const CorrectionStatus = {
  Pending: 'pending',
  Approved: 'approved',
  Rejected: 'rejected',
} as const;

export type CorrectionStatus = (typeof CorrectionStatus)[keyof typeof CorrectionStatus];

export const CORRECTION_STATUS_LABELS: Record<CorrectionStatus, string> = {
  pending: 'Awaiting verification',
  approved: 'Approved',
  rejected: 'Declined',
};

/** The fields a student may ask to have corrected. */
export const CorrectableField = {
  FirstName: 'firstName',
  MiddleName: 'middleName',
  LastName: 'lastName',
  DateOfBirth: 'dateOfBirth',
  Photo: 'photoUrl',
} as const;

export type CorrectableField = (typeof CorrectableField)[keyof typeof CorrectableField];

export const CORRECTABLE_FIELD_LABELS: Record<CorrectableField, string> = {
  firstName: 'First name',
  middleName: 'Middle name',
  lastName: 'Last name',
  dateOfBirth: 'Date of birth',
  photoUrl: 'Photograph',
};

/** Only the fields actually being changed are present. */
export type CorrectionChanges = Partial<Record<CorrectableField, string>>;

/**
 * Which documents the student must bring, derived from what they are changing.
 *
 * Computed rather than typed by a clerk, so every student asking for the same change is
 * told the same thing, and the office is not asked for documents that prove nothing.
 */
export function requiredDocumentsFor(changes: CorrectionChanges): string[] {
  const documents = new Set<string>();

  const changingName =
    'firstName' in changes || 'middleName' in changes || 'lastName' in changes;

  if (changingName) {
    documents.add('School leaving certificate or birth certificate showing your name');
    documents.add('Aadhaar card or passport');
  }

  if ('dateOfBirth' in changes) {
    documents.add(
      'Birth certificate or school leaving certificate showing your date of birth',
    );
  }

  if ('photoUrl' in changes) {
    documents.add('Photo identity proof (Aadhaar card, passport or college ID)');
  }

  return [...documents];
}

export type CorrectionRequestDetail = {
  id: string;
  ticketNumber: string;
  status: CorrectionStatus;

  studentId: string;
  studentName: string;
  rollNumber: string;

  /** What the record says now, so a clerk can compare without a second lookup. */
  current: CorrectionChanges;
  /** What the student is asking for. Only changed fields appear. */
  requested: CorrectionChanges;
  requiredDocuments: string[];

  /** Present only when declined. */
  reason: string | null;

  createdAt: string;
  reviewedAt: string | null;
};

export type CreateCorrectionRequest = {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  dateOfBirth?: string;
  photoUrl?: string;
};

export type DeclineCorrectionRequest = {
  reason: string;
};

/** Signed parameters for a direct browser upload to Cloudinary. */
export type UploadSignature = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
  /** Where the browser POSTs the file. */
  uploadUrl: string;
};
