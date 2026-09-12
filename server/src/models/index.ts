/**
 * Registers every Mongoose model.
 *
 * A model only exists once the module defining it has been imported. If a schema
 * references another model that nothing has imported yet, `populate()` fails at runtime
 * with "Schema hasn't been registered for model X" — a 500 on whatever route happened to
 * populate first.
 *
 * Importing this barrel once during bootstrap registers them all up front, so
 * registration never depends on which route a request happens to hit first.
 */
export { CollegeModel } from './college.model.js';
export { StreamModel } from './stream.model.js';
export { SubjectModel } from './subject.model.js';
export { ExamWindowModel } from './exam-window.model.js';
export { CollegeStreamModel } from './college-stream.model.js';
export { SemesterOfferingModel } from './semester-offering.model.js';
export { ExamFormModel } from './exam-form.model.js';
export { CounterModel, nextSequence } from './counter.model.js';
export { CorrectionRequestModel } from './correction-request.model.js';
export type {
  CorrectionRequest,
  CorrectionRequestDocument,
} from './correction-request.model.js';
export { UserModel } from './user.model.js';
export { RefreshTokenModel } from './refresh-token.model.js';

export type { College, CollegeDocument } from './college.model.js';
export type { Stream, StreamDocument } from './stream.model.js';
export type { Subject, SubjectDocument } from './subject.model.js';
export type { ExamWindow, ExamWindowDocument } from './exam-window.model.js';
export type { CollegeStream, CollegeStreamDocument } from './college-stream.model.js';
export type {
  SemesterOffering,
  SemesterOfferingDocument,
} from './semester-offering.model.js';
export type { ExamForm, ExamFormDocument } from './exam-form.model.js';
export type { User, UserDocument, UserId } from './user.model.js';
export type { RefreshToken, RefreshTokenDocument } from './refresh-token.model.js';
