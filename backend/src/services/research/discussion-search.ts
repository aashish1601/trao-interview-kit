import { load } from "cheerio";
import { env } from "../../config/env.js";
import type { Kit } from "../../domain/kit.js";

export interface DiscussionResult { title: string; url: string; snippet: string }
export interface DiscussionSearch { results: DiscussionResult[]; attempted: NonNullable<Kit["research"]>["attempted"]; note?: string }
export interface BraveSearchOptions {
  maxAttempts?: number;
  maxRetryDelayMs?: number;
  minIntervalMs?: number;
  disableAfterRateLimit?: boolean;
  timeoutMs?: number;
  maxConsecutiveFailures?: number;
}

function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

async function searchTavily(apiKey: string, query: string, timeoutMs: number): Promise<DiscussionResult[]> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: 5,
      search_depth: "basic",
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Tavily search returned HTTP ${response.status}`);
  const payload = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
  const items: DiscussionResult[] = [];
  for (const item of payload.results ?? []) {
    if (!item.url || !item.title) continue;
    try { if (new URL(item.url).protocol !== "https:") continue; } catch { continue; }
    items.push({
      title: item.title.slice(0, 180),
      url: item.url,
      snippet: (item.content ?? "").slice(0, 600),
    });
  }
  return items;
}

async function searchBrave(apiKey: string, query: string, timeoutMs: number): Promise<DiscussionResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "5");
  const response = await fetch(url, {
    headers: { accept: "application/json", "x-subscription-token": apiKey },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Brave search returned HTTP ${response.status}`);
  const payload = await response.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
  const items: DiscussionResult[] = [];
  for (const result of payload.web?.results ?? []) {
    if (!result.url || !result.title) continue;
    try { if (new URL(result.url).protocol !== "https:") continue; } catch { continue; }
    items.push({
      title: result.title.slice(0, 180),
      url: result.url,
      snippet: (result.description ?? "").slice(0, 600),
    });
  }
  return items;
}

async function searchDuckDuckGo(query: string, timeoutMs: number): Promise<DiscussionResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`DuckDuckGo returned HTTP ${response.status}`);
  const html = await response.text();
  const $ = load(html);
  const items: DiscussionResult[] = [];
  $(".result").each((_, el) => {
    const linkEl = $(el).find(".result__title a");
    const title = linkEl.text().trim();
    let rawHref = linkEl.attr("href") || "";
    let targetUrl = "";
    if (rawHref.includes("uddg=")) {
      try {
        const match = rawHref.match(/uddg=([^&]+)/);
        if (match && match[1]) targetUrl = decodeURIComponent(match[1]);
      } catch {}
    } else if (rawHref.startsWith("http")) {
      targetUrl = rawHref;
    }
    const snippet = $(el).find(".result__snippet").text().trim();
    if (title && targetUrl && targetUrl.startsWith("https://")) {
      items.push({
        title: title.slice(0, 180),
        url: targetUrl,
        snippet: snippet.slice(0, 600),
      });
    }
  });
  return items.slice(0, 5);
}

export class BraveDiscussionSearch {
  private lastRequestAt = 0;
  private disabledByRateLimit = false;
  private consecutiveFailures = 0;
  private readonly options: Required<BraveSearchOptions>;

  constructor(
    private apiKey = env.BRAVE_SEARCH_API_KEY,
    options: BraveSearchOptions = {},
  ) {
    this.options = {
      maxAttempts: options.maxAttempts ?? 3,
      maxRetryDelayMs: options.maxRetryDelayMs ?? 20_000,
      minIntervalMs: options.minIntervalMs ?? 500,
      disableAfterRateLimit: options.disableAfterRateLimit ?? true,
      timeoutMs: options.timeoutMs ?? 10_000,
      maxConsecutiveFailures: options.maxConsecutiveFailures ?? 3,
    };
  }

  async search(company: string): Promise<DiscussionSearch> {
    const queries = [
      `"${company}" interview process site:reddit.com OR site:glassdoor.com`,
      `"${company}" interview experience hiring process`,
    ];
    const all: DiscussionResult[] = [];
    const attempted: DiscussionSearch["attempted"] = [];

    const tavilyKey = env.TAVILY_API_KEY;
    const braveKey = this.apiKey;
    const providerName = tavilyKey ? "tavily" : braveKey ? "brave" : "duckduckgo";

    for (const query of queries) {
      let found = false;
      let wasRateLimited = false;

      if (this.disabledByRateLimit) {
        attempted.push({
          url: `${providerName}-search:${encodeURIComponent(query)}`,
          status: "skipped",
          reason: "Search provider was rate-limited earlier in this run.",
        });
        continue;
      }

      for (let attempt = 0; attempt < this.options.maxAttempts; attempt += 1) {
        let retryDelay = Math.min(5_000, 600 * (2 ** attempt)) + Math.floor(Math.random() * 250);
        try {
          const slotDelay = Math.max(0, this.options.minIntervalMs - (Date.now() - this.lastRequestAt));
          if (slotDelay) await new Promise((resolve) => setTimeout(resolve, slotDelay));
          this.lastRequestAt = Date.now();

          let results: DiscussionResult[] = [];
          if (tavilyKey) {
            results = await searchTavily(tavilyKey, query, this.options.timeoutMs);
          } else if (braveKey) {
            results = await searchBrave(braveKey, query, this.options.timeoutMs);
          } else {
            // Completely free zero-configuration fallback
            results = await searchDuckDuckGo(query, this.options.timeoutMs);
          }

          all.push(...results);
          found = true;
          break;
        } catch (error) {
          const isRateLimit = error instanceof Error && /429/.test(error.message);
          if (isRateLimit) wasRateLimited = true;
          if (attempt === this.options.maxAttempts - 1) break;
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }

      if (found) this.consecutiveFailures = 0;
      else this.consecutiveFailures += 1;

      if (!found && (wasRateLimited && this.options.disableAfterRateLimit || this.consecutiveFailures >= this.options.maxConsecutiveFailures)) {
        this.disabledByRateLimit = true;
      }

      attempted.push({
        url: `${providerName}-search:${encodeURIComponent(query)}`,
        status: found ? "used" : "skipped",
        ...(found ? {} : { reason: `Search request failed after ${this.options.maxAttempts} attempts` }),
      });
    }

    const unique = [...new Map(all.map((result) => [result.url, result])).values()].slice(0, 8);
    const completedSearch = attempted.some((item) => item.status === "used");

    return {
      results: unique,
      attempted,
      ...(unique.length
        ? {}
        : {
            note: completedSearch
              ? "No public interview discussion was found in the completed search results."
              : "Public interview discussion search could not be completed; the brief does not make claims about interview rounds.",
          }),
    };
  }
}
