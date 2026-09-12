import { Types } from 'mongoose';
import type {
  CollegeDetail,
  CollegeWithStats,
  CreateCollegeAdminResponse,
  CreateCollegeRequest,
  UpdateCollegeRequest,
} from '@ues/shared';
import { Role } from '@ues/shared';
import { CollegeModel, type CollegeDocument } from '../models/college.model.js';
import { UserModel } from '../models/user.model.js';
import { RefreshTokenModel } from '../models/refresh-token.model.js';
import { AppError } from '../utils/app-error.js';
import { hashPassword } from './auth.service.js';
import { generateTemporaryPassword } from '../utils/password.js';
import { formatFullName } from '../utils/names.js';

/**
 * College management. University-admin territory only — the route layer enforces that,
 * and nothing here is tenant-scoped because this *is* the tenant.
 */

function toCollegeDetail(college: CollegeDocument): CollegeDetail {
  return {
    id: String(college._id),
    name: college.name,
    code: college.code,
    city: college.city ?? '',
    address: college.address ?? '',
    affiliationYear: college.affiliationYear ?? null,
    isActive: college.isActive,
    createdAt: college.createdAt.toISOString(),
  };
}

const EMPTY_STATS = {
  total: 0,
  collegeAdmins: 0,
  faculty: 0,
  clerks: 0,
  students: 0,
};

const ROLE_TO_STAT: Record<string, keyof typeof EMPTY_STATS> = {
  [Role.CollegeAdmin]: 'collegeAdmins',
  [Role.Faculty]: 'faculty',
  [Role.Clerk]: 'clerks',
  [Role.Student]: 'students',
};

/**
 * Lists every college with its headcount by role.
 *
 * The counts come from one aggregation over the users collection, not a query per
 * college. With N colleges the naive approach is N+1 round trips; this is two regardless
 * of how many colleges exist — the difference between a page that stays fast at 800
 * affiliated colleges and one that does not.
 */
export async function listColleges(): Promise<CollegeWithStats[]> {
  const colleges = await CollegeModel.find().sort({ name: 1 });

  const counts = await UserModel.aggregate<{
    _id: { collegeId: Types.ObjectId | null; role: string };
    count: number;
  }>([
    { $match: { collegeId: { $ne: null } } },
    { $group: { _id: { collegeId: '$collegeId', role: '$role' }, count: { $sum: 1 } } },
  ]);

  const statsByCollege = new Map<string, typeof EMPTY_STATS>();

  for (const row of counts) {
    const key = String(row._id.collegeId);
    const stats = statsByCollege.get(key) ?? { ...EMPTY_STATS };
    const field = ROLE_TO_STAT[row._id.role];
    if (field) stats[field] += row.count;
    stats.total += row.count;
    statsByCollege.set(key, stats);
  }

  return colleges.map((college) => ({
    ...toCollegeDetail(college),
    stats: statsByCollege.get(String(college._id)) ?? { ...EMPTY_STATS },
  }));
}

export async function getCollegeById(id: string): Promise<CollegeDetail> {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound('College not found.');

  const college = await CollegeModel.findById(id);
  if (!college) throw AppError.notFound('College not found.');

  return toCollegeDetail(college);
}

export async function createCollege(input: CreateCollegeRequest): Promise<CollegeDetail> {
  // Checked explicitly so the message names the conflict, rather than surfacing a raw
  // duplicate-key error. The unique index is still the real guarantee — this check and
  // the insert are not atomic, and a concurrent create would race past it.
  const existing = await CollegeModel.findOne({ code: input.code.toUpperCase() });
  if (existing) {
    throw AppError.conflict(
      `A college with code ${input.code.toUpperCase()} already exists.`,
      {
        code: ['This code is already in use'],
      },
    );
  }

  const college = await CollegeModel.create(input);
  return toCollegeDetail(college);
}

export async function updateCollege(
  id: string,
  input: UpdateCollegeRequest,
): Promise<CollegeDetail> {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound('College not found.');

  const college = await CollegeModel.findById(id);
  if (!college) throw AppError.notFound('College not found.');

  if (input.code && input.code.toUpperCase() !== college.code) {
    const clash = await CollegeModel.findOne({
      code: input.code.toUpperCase(),
      _id: { $ne: college._id },
    });
    if (clash) {
      throw AppError.conflict(
        `A college with code ${input.code.toUpperCase()} already exists.`,
        {
          code: ['This code is already in use'],
        },
      );
    }
  }

  Object.assign(college, input);
  await college.save();

  return toCollegeDetail(college);
}

/**
 * Activates or deactivates a college.
 *
 * Deactivating blocks every one of its users at login and kills their live sessions,
 * without deleting a single record — exam history has to survive an affiliation lapsing.
 * Revoking the refresh tokens matters: without it, anyone already signed in would keep
 * working until their refresh token expired, days later.
 */
export async function setCollegeStatus(
  id: string,
  isActive: boolean,
): Promise<CollegeDetail> {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound('College not found.');

  const college = await CollegeModel.findById(id);
  if (!college) throw AppError.notFound('College not found.');

  college.isActive = isActive;
  await college.save();

  if (!isActive) {
    const userIds = await UserModel.find({ collegeId: college._id }).distinct('_id');
    await RefreshTokenModel.updateMany(
      { userId: { $in: userIds }, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }

  return toCollegeDetail(college);
}

/**
 * Permanently removes a college — but only while nothing depends on it.
 *
 * Once a college has users it has history, so deletion is refused and deactivation is
 * offered instead. A cascade delete here would silently destroy exam records, which is
 * the kind of convenience nobody thanks you for later.
 */
export async function deleteCollege(id: string): Promise<void> {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound('College not found.');

  const college = await CollegeModel.findById(id);
  if (!college) throw AppError.notFound('College not found.');

  const userCount = await UserModel.countDocuments({ collegeId: college._id });
  if (userCount > 0) {
    throw AppError.conflict(
      `${college.name} has ${userCount} user${userCount === 1 ? '' : 's'} and cannot be deleted. Deactivate it instead.`,
    );
  }

  await college.deleteOne();
}

/**
 * Creates the administrator for a college.
 *
 * The password is generated here rather than chosen by the university admin, and
 * returned exactly once. It is stored only as a bcrypt hash, so it cannot be looked up
 * again — losing it means issuing a new one.
 */
export async function createCollegeAdmin(
  collegeId: string,
  input: { email: string; firstName: string; middleName?: string; lastName: string },
): Promise<CreateCollegeAdminResponse> {
  if (!Types.ObjectId.isValid(collegeId)) throw AppError.notFound('College not found.');

  const college = await CollegeModel.findById(collegeId);
  if (!college) throw AppError.notFound('College not found.');
  if (!college.isActive) {
    throw AppError.badRequest('Activate the college before adding an administrator.');
  }

  const email = input.email.toLowerCase().trim();
  const existing = await UserModel.findOne({ email });
  if (existing) {
    throw AppError.conflict('That email address is already registered.', {
      email: ['Already in use'],
    });
  }

  const temporaryPassword = generateTemporaryPassword();

  const user = await UserModel.create({
    email,
    passwordHash: await hashPassword(temporaryPassword),
    firstName: input.firstName,
    middleName: input.middleName ?? null,
    lastName: input.lastName,
    role: Role.CollegeAdmin,
    collegeId: college._id,
  });

  return {
    user: {
      id: String(user._id),
      email: user.email,
      fullName: formatFullName(user),
    },
    temporaryPassword,
  };
}
