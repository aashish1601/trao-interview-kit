import { env } from "../../config/env.js";
import { z } from "zod";

export interface JsonResult<T> { value: T; degraded: boolean; error?: string }
export interface GeminiClientOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  maxRetryDelayMs?: number;
  minIntervalMs?: number;
  disableAfterRateLimit?: boolean;
  maxConsecutiveFailures?: number;
}

function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.min(60_000, Math.max(0, seconds * 1000));
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function cleanJsonString(input: string): string {
  let cleaned = input.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  cleaned = cleaned.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");
  let start = -1;
  if (firstBrace !== -1 && firstBracket !== -1) start = Math.min(firstBrace, firstBracket);
  else if (firstBrace !== -1) start = firstBrace;
  else if (firstBracket !== -1) start = firstBracket;
  if (start > 0) cleaned = cleaned.slice(start);
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");
  return cleaned;
}

function parseModelJson(text: string): unknown {
  const cleaned = cleanJsonString(text);
  try {
    return JSON.parse(cleaned);
  } catch (initialError) {
    try {
      const fixed = cleaned
        .replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":')
        .replace(/(^|[{,\n]\s*)([a-zA-Z_][a-zA-Z0-9_-]*)\s*:/gm, '$1"$2":')
        .replace(/(["\d\]}])\s*\n\s*([a-zA-Z0-9_"]+\s*:)/g, '$1,\n$2')
        .replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(fixed);
    } catch {}

    const lastBrace = cleaned.lastIndexOf("}");
    if (lastBrace > 0) {
      const cut = cleaned.slice(0, lastBrace + 1).replace(/,\s*([}\]])/g, "$1").trim();
      if (cleaned.startsWith("[")) {
        try { return JSON.parse(cut + "]"); } catch {}
      } else if (cleaned.startsWith("{")) {
        try { return JSON.parse(cut); } catch {}
      }
    }
    const lastBracket = cleaned.lastIndexOf("]");
    if (lastBracket > 0 && cleaned.startsWith("[")) {
      try { return JSON.parse(cleaned.slice(0, lastBracket + 1).replace(/,\s*([}\]])/g, "$1")); } catch {}
    }
    try {
      return JSON.parse(cleaned.replace(/'/g, '"').replace(/,\s*([}\]])/g, "$1"));
    } catch {}
    throw initialError;
  }
}

type ProviderType = "groq" | "grok" | "gemini";

export class GeminiClient {
  private lastRequestAt = 0;
  private disabledByRateLimit = false;
  private consecutiveFailures = 0;
  private readonly options: Required<GeminiClientOptions>;
  private provider: ProviderType = "gemini";
  private activeApiKey = "";
  private activeModel = "";

  constructor(
    apiKey?: string,
    model?: string,
    options: GeminiClientOptions = {},
  ) {
    this.options = {
      timeoutMs: options.timeoutMs ?? 45_000,
      maxAttempts: options.maxAttempts ?? 3,
      maxRetryDelayMs: options.maxRetryDelayMs ?? 30_000,
      minIntervalMs: options.minIntervalMs ?? 1000,
      disableAfterRateLimit: options.disableAfterRateLimit ?? false,
      maxConsecutiveFailures: options.maxConsecutiveFailures ?? 5,
    };

    // Determine the active provider and key:
    // Check Groq (gsk_...) or Grok (xai-...) or Gemini (AIzaSy...)
    const candidateGroq = env.GROQ_API_KEY || (env.GROK_API_KEY.startsWith("gsk_") ? env.GROK_API_KEY : "");
    const candidateGrok = env.GROK_API_KEY.startsWith("xai-") ? env.GROK_API_KEY : "";
    const candidateGemini = env.GEMINI_API_KEY;

    if (apiKey !== undefined) {
      this.activeApiKey = apiKey;
      if (!apiKey) {
        this.provider = "gemini";
        this.activeModel = model || "gemini-1.5-flash";
      } else if (apiKey.startsWith("gsk_")) {
        this.provider = "groq";
        this.activeModel = model || env.GROQ_MODEL || "openai/gpt-oss-120b";
      } else if (apiKey.startsWith("xai-")) {
        this.provider = "grok";
        this.activeModel = model || env.GROK_MODEL || "grok-2-latest";
      } else {
        this.provider = "gemini";
        this.activeModel = model || env.GEMINI_MODEL || "gemini-1.5-flash";
      }
    } else if (candidateGroq) {
      this.provider = "groq";
      this.activeApiKey = candidateGroq;
      this.activeModel = model || env.GROQ_MODEL || "openai/gpt-oss-120b";
    } else if (candidateGrok) {
      this.provider = "grok";
      this.activeApiKey = candidateGrok;
      this.activeModel = model || env.GROK_MODEL || "grok-2-latest";
    } else if (candidateGemini) {
      this.provider = "gemini";
      this.activeApiKey = candidateGemini;
      this.activeModel = model || env.GEMINI_MODEL || "gemini-1.5-flash";
    } else {
      this.activeApiKey = "";
      this.activeModel = model || "gemini-1.5-flash";
      this.provider = "gemini";
    }
  }

  get configured(): boolean {
    return Boolean(this.activeApiKey);
  }

  get currentProvider(): string {
    return this.provider;
  }

  private async callGroqOrGrok(
    endpoint: string,
    prompt: string,
    maxTokens: number,
  ): Promise<string> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.activeApiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(this.options.timeoutMs),
      body: JSON.stringify({
        model: this.activeModel,
        messages: [
          {
            role: "system",
            content: "You are an expert technical interview and recruitment assistant. You MUST return strictly valid, RFC 8259 compliant JSON. Output JSON only without any explanation or markdown formatting.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: Math.min(8000, maxTokens),
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      const err = new Error(`${this.provider.toUpperCase()} returned HTTP ${response.status}: ${errText.slice(0, 180)}`);
      (err as any).status = response.status;
      (err as any).retryAfter = retryAfterMs(response);
      throw err;
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    const text = payload.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error(`${this.provider.toUpperCase()} returned empty message content.`);
    }
    return text.trim();
  }

  private async callGemini(
    prompt: string,
    maxTokens: number,
  ): Promise<string> {
    const cleanModel = (this.activeModel || "gemini-1.5-flash").replace(/^models\//, "");
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(this.activeApiKey)}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.activeApiKey },
      signal: AbortSignal.timeout(this.options.timeoutMs),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: maxTokens },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      const err = new Error(`Gemini returned HTTP ${response.status}: ${errText.slice(0, 180)}`);
      (err as any).status = response.status;
      (err as any).retryAfter = retryAfterMs(response);
      throw err;
    }

    const payload = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };

    const output = payload.candidates?.flatMap((c) => c.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    if (!output) {
      throw new Error(payload.error?.message ?? "Gemini returned an empty response.");
    }
    return output;
  }

  async generateJson<T>(
    prompt: string,
    schema: z.ZodType<T>,
    fallback: T,
    maxOutputTokens = 6000,
  ): Promise<JsonResult<T>> {
    if (!this.activeApiKey) {
      return {
        value: fallback,
        degraded: true,
        error: `LLM API key is not configured; deterministic fallback was used.`,
      };
    }
    if (this.disabledByRateLimit) {
      return {
        value: fallback,
        degraded: true,
        error: `${this.provider.toUpperCase()} is unavailable for the remaining steps in this run; deterministic fallback was used.`,
      };
    }

    let lastError = "The model returned invalid JSON.";
    let rateLimited = false;

    for (let attempt = 0; attempt < this.options.maxAttempts; attempt += 1) {
      let retryDelay = Math.min(10_000, 800 * (2 ** attempt)) + Math.floor(Math.random() * 250);
      try {
        const slotDelay = Math.max(0, this.options.minIntervalMs - (Date.now() - this.lastRequestAt));
        if (slotDelay) await new Promise((resolve) => setTimeout(resolve, slotDelay));
        this.lastRequestAt = Date.now();

        let rawOutput = "";
        if (this.provider === "groq") {
          rawOutput = await this.callGroqOrGrok(
            "https://api.groq.com/openai/v1/chat/completions",
            prompt,
            maxOutputTokens,
          );
        } else if (this.provider === "grok") {
          rawOutput = await this.callGroqOrGrok(
            "https://api.x.ai/v1/chat/completions",
            prompt,
            maxOutputTokens,
          );
        } else {
          rawOutput = await this.callGemini(prompt, maxOutputTokens);
        }

        try {
          const parsed = schema.safeParse(parseModelJson(rawOutput));
          if (parsed.success) {
            this.consecutiveFailures = 0;
            return { value: parsed.data, degraded: false };
          }
          lastError = `${this.provider.toUpperCase()} JSON did not match expected shape: ${parsed.error.issues.slice(0, 3).map((i) => i.path.join(".")).join(", ")}`;
        } catch (parseErr) {
          lastError = parseErr instanceof Error ? parseErr.message : "Invalid JSON from model.";
        }
      } catch (err: any) {
        const status = err?.status;
        if (status === 429) {
          rateLimited = true;
          retryDelay = Math.max(retryDelay, 2500 * (attempt + 1));
        }
        if (err?.retryAfter) {
          retryDelay = Math.min(this.options.maxRetryDelayMs, err.retryAfter);
        }
        lastError = err instanceof Error ? err.message : "LLM request failed.";
        if (attempt === this.options.maxAttempts - 1) break;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }

    this.consecutiveFailures += 1;
    if (rateLimited && this.options.disableAfterRateLimit) {
      this.disabledByRateLimit = true;
    }

    return {
      value: fallback,
      degraded: true,
      error: `${lastError} Deterministic fallback was used.`,
    };
  }
}

export { GeminiClient as LlmClient };
