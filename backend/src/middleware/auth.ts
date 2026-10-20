import type { NextFunction, Request, Response } from "express";
import { AppError } from "../domain/errors.js";
import { User } from "../models/User.js";

declare module "express-session" {
  interface SessionData { userId?: string; csrfToken?: string }
}

export interface AuthenticatedRequest extends Request { userId?: string }

export async function requireAuth(request: Request, _response: Response, next: NextFunction): Promise<void> {
  try {
    const userId = request.session.userId;
    if (!userId) throw new AppError("UNAUTHENTICATED", "Please sign in to continue.", 401);
    const exists = await User.exists({ _id: userId });
    if (!exists) {
      request.session.destroy(() => undefined);
      throw new AppError("SESSION_EXPIRED", "Your session has expired. Please sign in again.", 401);
    }
    (request as AuthenticatedRequest).userId = userId;
    next();
  } catch (error) { next(error); }
}

export function csrfProtection(request: Request, _response: Response, next: NextFunction): void {
  const expected = request.session.csrfToken;
  const provided = request.get("x-csrf-token");
  if (!expected || !provided || expected.length !== provided.length) {
    next(new AppError("CSRF_INVALID", "Refresh the page and try again.", 403));
    return;
  }
  let same = 0;
  for (let index = 0; index < expected.length; index += 1) same |= expected.charCodeAt(index) ^ provided.charCodeAt(index);
  if (same !== 0) { next(new AppError("CSRF_INVALID", "Refresh the page and try again.", 403)); return; }
  next();
}
