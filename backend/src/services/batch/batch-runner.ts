import { caseInputSchema } from "../../domain/schemas.js";
import { AppError } from "../../domain/errors.js";
import { env } from "../../config/env.js";
import { buildKit, type BuildResult, type BuildProgress } from "../generation/kit-builder.js";
import { GeminiClient } from "../llm/gemini-client.js";
import { BraveDiscussionSearch } from "../research/discussion-search.js";

export interface OutputEntry {
  id: string;
  status: "ok" | "failed";
  kit: unknown | null;
  error: { code: string; message: string } | null;
}
export interface BatchOutput { version: "1.0"; generated_at: string; kits: OutputEntry[] }
export type Pipeline = (input: { id: string; jd: string; company_url: string; days: number }, options: { allowLocal: boolean; maxPages: number; maxFetchAttempts: number; requestTimeoutMs: number; llm: GeminiClient; search: BraveDiscussionSearch }, onProgress: (progress: BuildProgress) => void) => Promise<BuildResult>;

function caseId(value: unknown, index: number): string {
  if (typeof value === "object" && value !== null) {
    const id = (value as Record<string, unknown>)["id"];
    if (typeof id === "string" && id.trim()) return id.slice(0, 120);
  }
  return `case-${index + 1}`;
}

export async function runBatchCases(
  cases: unknown[],
  pipeline: Pipeline = (input, options, onProgress) => buildKit(input, options, onProgress),
  onProgress: (id: string, progress: BuildProgress) => void = () => undefined,
): Promise<BatchOutput> {
  const output: OutputEntry[] = [];
  // Reuse provider clients across cases so pacing applies to the whole evaluation run.
  // A repeated 429 switches later generation calls to deterministic fallbacks.
  const llm = new GeminiClient(undefined, undefined, {
    timeoutMs: 30_000,
    maxAttempts: 2,
    maxRetryDelayMs: 5_000,
    minIntervalMs: 1_200,
    disableAfterRateLimit: true,
    maxConsecutiveFailures: 2,
  });
  const search = new BraveDiscussionSearch(undefined, {
    maxAttempts: 2,
    maxRetryDelayMs: 2_500,
    minIntervalMs: 750,
    disableAfterRateLimit: true,
    timeoutMs: 7_000,
    maxConsecutiveFailures: 2,
  });
  for (let index = 0; index < cases.length; index += 1) {
    const raw = cases[index];
    const id = caseId(raw, index);
    const parsed = caseInputSchema.safeParse(raw);
    if (!parsed.success) {
      output.push({ id, status: "failed", kit: null, error: { code: "INPUT_INVALID", message: parsed.error.issues[0]?.message ?? "Case input is invalid." } });
      continue;
    }
    try {
      const result = await pipeline(parsed.data, {
        allowLocal: true,
        maxPages: Math.min(env.MAX_CRAWL_PAGES, 6),
        maxFetchAttempts: 2,
        requestTimeoutMs: 6000,
        llm,
        search,
      }, (progress) => onProgress(id, progress));
      output.push({ id: parsed.data.id, status: "ok", kit: result.kit, error: null });
    } catch (error) {
      output.push({
        id: parsed.data.id,
        status: "failed",
        kit: null,
        error: { code: error instanceof AppError ? error.code : "GENERATION_FAILED", message: error instanceof Error ? error.message.slice(0, 500) : "This case could not produce a kit." },
      });
    }
  }
  return { version: "1.0", generated_at: new Date().toISOString(), kits: output };
}
