import mongoose from "mongoose";
import { env } from "../../config/env.js";
import { AppError } from "../../domain/errors.js";
import { emptyEditState, type Kit } from "../../domain/kit.js";
import { validateKit } from "../../domain/schemas.js";
import { GenerationJob } from "../../models/GenerationJob.js";
import { KitModel } from "../../models/Kit.js";
import { buildKit, regenerateKitSection, type BuildProgress, type ResearchContext } from "./kit-builder.js";
import { createEditState, mergeRegeneratedSection, type RegenerationTarget } from "./merge-regeneration.js";

let draining = false;

async function updateProgress(kitId: mongoose.Types.ObjectId, progress: BuildProgress): Promise<void> {
  await KitModel.updateOne({ _id: kitId }, { $set: { progress } });
}

async function processJob(job: any): Promise<void> {
  const kitDoc: any = await KitModel.findById(job.kitId);
  if (!kitDoc) {
    await GenerationJob.updateOne({ _id: job._id }, { $set: { status: "failed", error: { code: "KIT_NOT_FOUND", message: "The kit for this job no longer exists." }, completedAt: new Date() } });
    return;
  }
  const kitId = kitDoc._id as mongoose.Types.ObjectId;
  try {
    if (job.type === "initial") {
      await KitModel.updateOne({ _id: kitId }, { $set: { status: "running", progress: { stage: "extracting", percent: 5, message: "Starting the preparation research" } } });
      let pendingProgress = Promise.resolve();
      const result = await buildKit(kitDoc.input, {
        allowLocal: !env.isProduction && env.allowLocalCompanyUrls,
        maxPages: env.MAX_CRAWL_PAGES,
      }, (progress) => { pendingProgress = pendingProgress.then(() => updateProgress(kitId, progress)); });
      await pendingProgress;
      const validation = validateKit(result.kit);
      if (!validation.success) throw new AppError("KIT_INVALID", "Generated kit did not pass structure validation.", 422, validation.errors);
      await KitModel.updateOne({ _id: kitId }, { $set: {
        kit: validation.data,
        editState: createEditState(validation.data),
        researchContext: result.researchContext,
        degraded: result.degraded,
        status: "ready",
        progress: { stage: "complete", percent: 100, message: "Your preparation kit is ready" },
      }, $unset: { generationError: 1 } });
    } else {
      const existing = kitDoc.kit as Kit | null;
      if (!existing) throw new AppError("KIT_NOT_READY", "This kit has not finished generating yet.", 409);
      const currentState = (kitDoc.editState || emptyEditState()) as ReturnType<typeof createEditState>;
      const context = kitDoc.researchContext as ResearchContext;
      const target = job.target as RegenerationTarget;
      const generated = await regenerateKitSection(existing, context, target);
      const latest: any = await KitModel.findById(job.kitId);
      if (!latest?.kit) throw new AppError("KIT_NOT_READY", "The kit was removed before regeneration completed.", 409);
      const latestState = (latest.editState || currentState) as ReturnType<typeof createEditState>;
      if (job.force && (target === "company_brief" || target === "schedule")) {
        latestState.sections[target] = { edited: false, pinned: false };
      }
      const merged = mergeRegeneratedSection(latest.kit as Kit, latestState, target, generated);
      if (target === "company_brief" && generated.company_brief && merged.kit.research) {
        merged.kit.research.notes = merged.kit.research.notes.filter(
          (note) => !note.includes("Deterministic fallback") && !note.includes("Gemini is unavailable") && !note.includes("404")
        );
      }
      const validation = validateKit(merged.kit);
      if (!validation.success) throw new AppError("KIT_INVALID", "Regenerated section did not pass structure validation.", 422, validation.errors);
      await KitModel.updateOne({ _id: kitId }, { $set: {
        kit: validation.data,
        editState: merged.editState,
        status: "ready",
        progress: { stage: "complete", percent: 100, message: "The selected section has been refreshed" },
      }, $unset: { generationError: 1 } });
    }
    await GenerationJob.updateOne({ _id: job._id }, { $set: { status: "completed", completedAt: new Date() } });
  } catch (error) {
    const code = error instanceof AppError ? error.code : "GENERATION_FAILED";
    const message = error instanceof Error ? error.message : "Generation failed. Please try again.";
    const hasExistingKit = Boolean(kitDoc.kit);
    await KitModel.updateOne({ _id: kitId }, { $set: {
      status: hasExistingKit ? "ready" : "failed",
      generationError: { code, message: "Generation could not finish. You can retry this step." },
      progress: { stage: "failed", percent: Number(kitDoc.progress?.percent ?? 0), message: "Generation hit a problem" },
    } });
    await GenerationJob.updateOne({ _id: job._id }, { $set: { status: "failed", error: { code, message }, completedAt: new Date() } });
  }
}

async function drainQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (true) {
      const job = await GenerationJob.findOneAndUpdate(
        { status: "queued" },
        { $set: { status: "running", startedAt: new Date() } },
        { sort: { createdAt: 1 }, new: true },
      );
      if (!job) break;
      await processJob(job);
    }
  } catch (error) {
    console.error("Generation queue error", { message: error instanceof Error ? error.message : "unknown" });
  } finally { draining = false; }
}

export async function enqueueGenerationJob(input: { kitId: mongoose.Types.ObjectId; userId: mongoose.Types.ObjectId; type: "initial" | "regeneration"; target?: string; force?: boolean }): Promise<void> {
  await GenerationJob.create({ ...input, status: "queued" });
  void drainQueue();
}

export async function startGenerationWorker(): Promise<void> {
  const staleCutoff = new Date(Date.now() - 15 * 60_000);
  const stale = await GenerationJob.find({ status: "running", startedAt: { $lt: staleCutoff } }).select("_id kitId");
  if (stale.length) {
    await GenerationJob.updateMany({ _id: { $in: stale.map((job: any) => job._id) } }, { $set: { status: "queued" } });
    await KitModel.updateMany({ _id: { $in: stale.map((job: any) => job.kitId) }, status: "running" }, { $set: { status: "queued", progress: { stage: "queued", percent: 0, message: "Resuming after a server restart" } } });
  }
  const timer = setInterval(() => { void drainQueue(); }, 1500);
  timer.unref();
  const recoveryTimer = setInterval(async () => {
    const cutoff = new Date(Date.now() - 15 * 60_000);
    const staleJobs = await GenerationJob.find({ status: "running", startedAt: { $lt: cutoff } }).select("_id kitId");
    if (!staleJobs.length) return;
    const ids = staleJobs.map((job: any) => job._id);
    await GenerationJob.updateMany({ _id: { $in: ids } }, { $set: { status: "queued" } });
    await KitModel.updateMany({ _id: { $in: staleJobs.map((job: any) => job.kitId) } }, { $set: { status: "queued", progress: { stage: "queued", percent: 0, message: "Resuming an interrupted generation" } } });
  }, 60_000);
  recoveryTimer.unref();
  void drainQueue();
}
