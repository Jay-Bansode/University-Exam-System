import { Types } from 'mongoose';
import type {
  CreateExamWindowRequest,
  ExamWindowDetail,
  UpdateExamWindowRequest,
} from '@ues/shared';
import {
  ExamWindowModel,
  isWindowOpen,
  windowStatus,
  type ExamWindowDocument,
} from '../models/exam-window.model.js';
import { AppError } from '../utils/app-error.js';

/**
 * Exam registration windows — the university's control over the calendar.
 *
 * Whether a window is open is always computed here, against the server's clock. The
 * client is told the answer but never trusted to decide it, because the same rule has to
 * hold when a form is actually submitted in Phase 6.
 */

function toExamWindowDetail(window: ExamWindowDocument): ExamWindowDetail {
  return {
    id: String(window._id),
    academicYear: window.academicYear,
    semester: window.semester,
    openAt: window.openAt.toISOString(),
    closeAt: window.closeAt.toISOString(),
    isPublished: window.isPublished,
    isOpenNow: isWindowOpen(window),
    status: windowStatus(window),
  };
}

export async function listExamWindows(): Promise<ExamWindowDetail[]> {
  const windows = await ExamWindowModel.find().sort({
    academicYear: -1,
    semester: 1,
  });

  return windows.map(toExamWindowDetail);
}

/**
 * The window currently accepting forms for a semester, if any.
 *
 * Used by Phase 6 to decide whether a student may submit. Returns the document rather
 * than a DTO because the caller needs the dates for its own error message.
 */
export async function findOpenWindow(
  semester: number,
  now = new Date(),
): Promise<ExamWindowDocument | null> {
  return ExamWindowModel.findOne({
    semester,
    isPublished: true,
    openAt: { $lte: now },
    closeAt: { $gte: now },
  });
}

export async function createExamWindow(
  input: CreateExamWindowRequest,
): Promise<ExamWindowDetail> {
  const existing = await ExamWindowModel.findOne({
    academicYear: input.academicYear,
    semester: input.semester,
  });

  if (existing) {
    throw AppError.conflict(
      `A window already exists for semester ${input.semester} in ${input.academicYear}.`,
      { semester: ['Already scheduled for this year'] },
    );
  }

  const window = await ExamWindowModel.create({
    ...input,
    openAt: new Date(input.openAt),
    closeAt: new Date(input.closeAt),
  });

  return toExamWindowDetail(window);
}

export async function updateExamWindow(
  id: string,
  input: UpdateExamWindowRequest,
): Promise<ExamWindowDetail> {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound('Exam window not found.');

  const window = await ExamWindowModel.findById(id);
  if (!window) throw AppError.notFound('Exam window not found.');

  if (input.academicYear || input.semester) {
    const academicYear = input.academicYear ?? window.academicYear;
    const semester = input.semester ?? window.semester;

    const clash = await ExamWindowModel.findOne({
      academicYear,
      semester,
      _id: { $ne: window._id },
    });

    if (clash) {
      throw AppError.conflict(
        `A window already exists for semester ${semester} in ${academicYear}.`,
      );
    }
  }

  if (input.academicYear) window.academicYear = input.academicYear;
  if (input.semester) window.semester = input.semester;
  if (input.openAt) window.openAt = new Date(input.openAt);
  if (input.closeAt) window.closeAt = new Date(input.closeAt);
  if (input.isPublished !== undefined) window.isPublished = input.isPublished;

  await window.save();

  return toExamWindowDetail(window);
}

/**
 * Deletes a window.
 *
 * Refused while the window is open, because students may be mid-submission. Closing or
 * unpublishing it is the way to stop registration; deleting the record is for cleaning
 * up something scheduled by mistake.
 */
export async function deleteExamWindow(id: string): Promise<void> {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound('Exam window not found.');

  const window = await ExamWindowModel.findById(id);
  if (!window) throw AppError.notFound('Exam window not found.');

  if (isWindowOpen(window)) {
    throw AppError.conflict(
      'This window is currently open for registration. Unpublish it before deleting.',
    );
  }

  await window.deleteOne();
}
