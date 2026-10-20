import { createHash } from "node:crypto";
import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../domain/errors.js";
import { emptyEditState, type KitEditState } from "../domain/kit.js";
import { caseInputSchema, createKitInputSchema, kitEditStateSchema, validateKit } from "../domain/schemas.js";
import { KitModel } from "../models/Kit.js";
import { GenerationJob } from "../models/GenerationJob.js";
import { csrfProtection, requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { enqueueGenerationJob } from "../services/generation/generation-worker.js";
import { assertPublicHttpUrl } from "../services/retrieval/safe-fetch.js";

export const kitsRouter = Router();
kitsRouter.use(requireAuth);
kitsRouter.param("kitId", (_request, _response, next, kitId) => {
  if (!mongoose.isValidObjectId(kitId)) { next(new AppError("KIT_NOT_FOUND", "Kit not found.", 404)); return; }
  next();
});

function dto(doc: any) {
  return {
    id: String(doc._id),
    input: doc.input,
    status: doc.status,
    progress: doc.progress,
    generationError: doc.generationError ?? null,
    kit: doc.kit ?? null,
    editState: doc.editState ?? emptyEditState(),
    degraded: Boolean(doc.degraded),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function getUserId(request: AuthenticatedRequest): mongoose.Types.ObjectId {
  if (!request.userId) throw new AppError("UNAUTHENTICATED", "Please sign in to continue.", 401);
  return new mongoose.Types.ObjectId(request.userId);
}

function makeKey(input: { jd: string; company_url: string; days: number }): string {
  const url = new URL(input.company_url);
  url.hash = "";
  const normalized = `${input.jd.replace(/\s+/g, " ").trim().toLowerCase()}\n${url.toString().replace(/\/$/, "")}\n${input.days}`;
  return createHash("sha256").update(normalized).digest("hex");
}

async function validateCompanyUrl(url: string): Promise<void> {
  try {
    await assertPublicHttpUrl(url, !env.isProduction && env.allowLocalCompanyUrls);
  } catch (error) {
    if (error instanceof AppError && error.code === "COMPANY_UNREACHABLE") return;
    throw error;
  }
}

async function createOrReuseKit(input: { jd: string; company_url: string; days: number }, userId: mongoose.Types.ObjectId): Promise<any> {
  if (input.jd.length > env.MAX_JD_CHARS) throw new AppError("JD_TOO_LARGE", `Job descriptions must be ${env.MAX_JD_CHARS} characters or fewer.`, 413);
  await validateCompanyUrl(input.company_url);
  const idempotencyKey = makeKey(input);
  let existing: any = await KitModel.findOne({ userId, idempotencyKey });
  if (existing && existing.status !== "failed" && !existing.degraded) return existing;
  if (existing) {
    existing.status = "queued";
    existing.progress = { stage: "queued", percent: 0, message: "Regenerating kit" };
    existing.generationError = undefined;
    await existing.save();
  } else {
    try {
      existing = await KitModel.create({
        userId, input, idempotencyKey, status: "queued",
        progress: { stage: "queued", percent: 0, message: "Waiting to start" },
        editState: emptyEditState(),
      });
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && (error as { code?: number }).code === 11000) {
        existing = await KitModel.findOne({ userId, idempotencyKey });
        if (existing) return existing;
      }
      throw error;
    }
  }
  await enqueueGenerationJob({ kitId: existing._id, userId, type: "initial" });
  return existing;
}

kitsRouter.get("/", async (request, response, next) => {
  try {
    const userId = new mongoose.Types.ObjectId((request as AuthenticatedRequest).userId);
    const kits = await KitModel.find({ userId }).sort({ updatedAt: -1 }).limit(50);
    response.json({ kits: kits.map(dto) });
  } catch (error) { next(error); }
});

kitsRouter.post("/", csrfProtection, async (request, response, next) => {
  try {
    const input = createKitInputSchema.parse(request.body);
    const userId = new mongoose.Types.ObjectId((request as AuthenticatedRequest).userId);
    const kit = await createOrReuseKit(input, userId);
    response.status(202).json({ kit: dto(kit) });
  } catch (error) { next(error); }
});

kitsRouter.post("/batch", csrfProtection, async (request, response, next) => {
  try {
    const rows = z.array(z.unknown()).max(20).parse(request.body?.cases);
    const userId = new mongoose.Types.ObjectId((request as AuthenticatedRequest).userId);
    const results: Array<Record<string, unknown>> = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const input = caseInputSchema.safeParse(row);
      const rawId = typeof row === "object" && row !== null ? (row as Record<string, unknown>)["id"] : undefined;
      const id = typeof rawId === "string" && rawId ? rawId : `case-${index + 1}`;
      if (!input.success) {
        results.push({ id, status: "failed", kit_id: null, error: { code: "INVALID_CASE", message: input.error.issues[0]?.message ?? "Invalid case." } });
        continue;
      }
      try {
        const kit = await createOrReuseKit({ jd: input.data.jd, company_url: input.data.company_url, days: input.data.days }, userId);
        results.push({ id: input.data.id, status: kit.status, kit_id: String(kit._id), error: null });
      } catch (error) {
        results.push({ id: input.data.id, status: "failed", kit_id: null, error: { code: error instanceof AppError ? error.code : "CASE_FAILED", message: error instanceof Error ? error.message : "Case could not be queued." } });
      }
    }
    response.status(202).json({ results });
  } catch (error) { next(error); }
});

kitsRouter.get("/:kitId", async (request, response, next) => {
  try {
    const kit = await KitModel.findOne({ _id: request.params.kitId, userId: getUserId(request as AuthenticatedRequest) });
    if (!kit) throw new AppError("KIT_NOT_FOUND", "Kit not found.", 404);
    response.json({ kit: dto(kit) });
  } catch (error) { next(error); }
});

kitsRouter.patch("/:kitId", csrfProtection, async (request, response, next) => {
  try {
    const kitDoc: any = await KitModel.findOne({ _id: request.params.kitId, userId: getUserId(request as AuthenticatedRequest) });
    if (!kitDoc) throw new AppError("KIT_NOT_FOUND", "Kit not found.", 404);
    if (!kitDoc.kit) throw new AppError("KIT_NOT_READY", "This kit is still being generated.", 409);
    if (["queued", "running", "regenerating"].includes(kitDoc.status)) throw new AppError("GENERATION_IN_PROGRESS", "Wait for the current generation step before editing.", 409);
    const validation = validateKit(request.body?.kit);
    if (!validation.success) throw new AppError("KIT_INVALID", "The edited kit does not satisfy the kit contract.", 422, validation.errors);
    const stateResult = kitEditStateSchema.safeParse(request.body?.editState ?? kitDoc.editState ?? emptyEditState());
    if (!stateResult.success) throw new AppError("EDIT_STATE_INVALID", "The edit metadata is invalid.", 400);
    kitDoc.kit = validation.data;
    kitDoc.editState = stateResult.data as KitEditState;
    await kitDoc.save();
    response.json({ kit: dto(kitDoc) });
  } catch (error) { next(error); }
});

kitsRouter.post("/:kitId/practice", csrfProtection, async (request, response, next) => {
  try {
    const body = z.object({ flashcard_id: z.string().min(1), confidence: z.number().int().min(1).max(5) }).strict().parse(request.body);
    const kitDoc: any = await KitModel.findOne({ _id: request.params.kitId, userId: getUserId(request as AuthenticatedRequest) });
    if (!kitDoc?.kit) throw new AppError("KIT_NOT_FOUND", "Kit not found.", 404);
    if (!kitDoc.kit.flashcards.some((card: { id: string }) => card.id === body.flashcard_id)) throw new AppError("FLASHCARD_NOT_FOUND", "This card is no longer in the kit.", 404);
    const editState = { ...emptyEditState(), ...(kitDoc.editState ?? {}) };
    editState.practice = { ...(editState.practice ?? {}), [body.flashcard_id]: { confidence: body.confidence, reviewed_at: new Date().toISOString() } };
    kitDoc.editState = editState;
    await kitDoc.save();
    response.json({ practice: editState.practice });
  } catch (error) { next(error); }
});

kitsRouter.post("/:kitId/regenerate", csrfProtection, async (request, response, next) => {
  try {
    const body = z.object({ target: z.enum(["company_brief", "schedule", "flashcards", "technical", "behavioural", "system-design", "company-fit"]), force: z.boolean().optional() }).strict().parse(request.body);
    const userId = getUserId(request as AuthenticatedRequest);
    const kitDoc: any = await KitModel.findOneAndUpdate(
      { _id: request.params.kitId, userId, status: "ready", kit: { $ne: null } },
      { $set: { status: "regenerating", progress: { stage: "regenerating", percent: 0, message: `Refreshing ${body.target.replaceAll("-", " ")}` }, generationError: undefined } },
      { new: true, includeResultMetadata: false },
    );
    if (!kitDoc) {
      const exists = await KitModel.exists({ _id: request.params.kitId, userId });
      if (!exists) throw new AppError("KIT_NOT_FOUND", "Kit not found.", 404);
      throw new AppError("GENERATION_IN_PROGRESS", "Wait for the current generation step before regenerating another section.", 409);
    }
    await enqueueGenerationJob({ kitId: kitDoc._id, userId, type: "regeneration", target: body.target, force: body.force });
    response.status(202).json({ kit: dto(kitDoc) });
  } catch (error) { next(error); }
});

kitsRouter.post("/:kitId/retry", csrfProtection, async (request, response, next) => {
  try {
    const kitDoc: any = await KitModel.findOne({ _id: request.params.kitId, userId: getUserId(request as AuthenticatedRequest) });
    if (!kitDoc) throw new AppError("KIT_NOT_FOUND", "Kit not found.", 404);
    if (kitDoc.status !== "failed" || kitDoc.kit) throw new AppError("RETRY_NOT_AVAILABLE", "This kit does not need a full generation retry.", 409);
    kitDoc.status = "queued";
    kitDoc.progress = { stage: "queued", percent: 0, message: "Retrying kit generation" };
    await kitDoc.save();
    await enqueueGenerationJob({ kitId: kitDoc._id, userId: getUserId(request as AuthenticatedRequest), type: "initial" });
    response.status(202).json({ kit: dto(kitDoc) });
  } catch (error) { next(error); }
});

kitsRouter.delete("/:kitId", csrfProtection, async (request, response, next) => {
  try {
    const userId = getUserId(request as AuthenticatedRequest);
    const kitDoc = await KitModel.findOneAndDelete({ _id: request.params.kitId, userId });
    if (!kitDoc) throw new AppError("KIT_NOT_FOUND", "Kit not found.", 404);
    await GenerationJob.deleteMany({ kitId: kitDoc._id, userId });
    response.status(204).end();
  } catch (error) { next(error); }
});
