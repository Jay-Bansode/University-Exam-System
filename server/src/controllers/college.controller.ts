import type { Request, Response } from 'express';
import type {
  CreateCollegeAdminRequest,
  CreateCollegeRequest,
  UpdateCollegeRequest,
} from '@ues/shared';
import * as collegeService from '../services/college.service.js';
import { sendSuccess } from '../utils/respond.js';

/** HTTP handling for college management. No logic beyond translating request to service. */

function idOf(req: Request): string {
  return (req.params as unknown as { id: string }).id;
}

export async function listCollegesHandler(_req: Request, res: Response): Promise<void> {
  const colleges = await collegeService.listColleges();
  sendSuccess(res, { colleges });
}

export async function getCollegeHandler(req: Request, res: Response): Promise<void> {
  const college = await collegeService.getCollegeById(idOf(req));
  sendSuccess(res, { college });
}

export async function createCollegeHandler(req: Request, res: Response): Promise<void> {
  const college = await collegeService.createCollege(req.body as CreateCollegeRequest);
  // 201 with the created resource, so the client need not re-fetch to show it.
  sendSuccess(res, { college }, 201);
}

export async function updateCollegeHandler(req: Request, res: Response): Promise<void> {
  const college = await collegeService.updateCollege(
    idOf(req),
    req.body as UpdateCollegeRequest,
  );
  sendSuccess(res, { college });
}

export async function setCollegeStatusHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { isActive } = req.body as { isActive: boolean };
  const college = await collegeService.setCollegeStatus(idOf(req), isActive);
  sendSuccess(res, { college });
}

export async function deleteCollegeHandler(req: Request, res: Response): Promise<void> {
  await collegeService.deleteCollege(idOf(req));
  sendSuccess(res, { deleted: true });
}

export async function createCollegeAdminHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const result = await collegeService.createCollegeAdmin(
    idOf(req),
    req.body as CreateCollegeAdminRequest,
  );
  sendSuccess(res, result, 201);
}
