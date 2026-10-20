import { randomBytes } from "node:crypto";
import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { AppError } from "../domain/errors.js";
import { csrfProtection, requireAuth } from "../middleware/auth.js";
import { env } from "../config/env.js";

export const authRouter = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
const authBody = z.object({ email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()), password: z.string().min(10).max(72) }).strict();

authRouter.get("/csrf", (request, response) => {
  request.session.csrfToken ??= randomBytes(32).toString("base64url");
  response.json({ csrfToken: request.session.csrfToken });
});

async function establishSession(request: Request, userId: string): Promise<string> {
  await new Promise<void>((resolve, reject) => request.session.regenerate((error: Error | null) => error ? reject(error) : resolve()));
  request.session.userId = userId;
  request.session.csrfToken = randomBytes(32).toString("base64url");
  await new Promise<void>((resolve, reject) => request.session.save((error: Error | null) => error ? reject(error) : resolve()));
  return request.session.csrfToken;
}

authRouter.post("/register", authLimiter, csrfProtection, async (request, response, next) => {
  try {
    const parsed = authBody.safeParse(request.body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Use a valid email and a password with at least 10 characters.", 400);
    if (Buffer.byteLength(parsed.data.password, "utf8") > 72) throw new AppError("VALIDATION_ERROR", "Password is too long.", 400);
    if (await User.exists({ email: parsed.data.email })) throw new AppError("EMAIL_IN_USE", "An account with this email already exists.", 409);
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await User.create({ email: parsed.data.email, passwordHash });
    const csrfToken = await establishSession(request, String(user._id));
    response.status(201).json({ user: { id: String(user._id), email: user.email }, csrfToken });
  } catch (error) { next(error); }
});

authRouter.post("/login", authLimiter, csrfProtection, async (request, response, next) => {
  try {
    const parsed = authBody.safeParse(request.body);
    if (!parsed.success) throw new AppError("INVALID_CREDENTIALS", "Email or password is incorrect.", 401);
    const user = await User.findOne({ email: parsed.data.email }).select("+passwordHash");
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) throw new AppError("INVALID_CREDENTIALS", "Email or password is incorrect.", 401);
    const csrfToken = await establishSession(request, String(user._id));
    response.json({ user: { id: String(user._id), email: user.email }, csrfToken });
  } catch (error) { next(error); }
});

authRouter.get("/me", requireAuth, async (request, response, next) => {
  try {
    const user = await User.findById(request.session.userId).select("email");
    if (!user) throw new AppError("SESSION_EXPIRED", "Your session has expired. Please sign in again.", 401);
    response.json({ user: { id: String(user._id), email: user.email }, csrfToken: request.session.csrfToken });
  } catch (error) { next(error); }
});

authRouter.post("/logout", requireAuth, csrfProtection, (request, response, next) => {
  request.session.destroy((error) => {
    if (error) { next(error); return; }
    response.clearCookie(env.SESSION_COOKIE_NAME, { path: "/", httpOnly: true, secure: env.isProduction, sameSite: env.isProduction ? "none" : "lax" });
    response.status(204).end();
  });
});
