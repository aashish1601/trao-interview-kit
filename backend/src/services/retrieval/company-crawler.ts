import { load } from "cheerio";
import type { Kit } from "../../domain/kit.js";
import { AppError } from "../../domain/errors.js";
import { fetchBounded, assertPublicHttpUrl } from "./safe-fetch.js";

export interface CrawledPage { url: string; title: string; text: string; depth: number }
export interface CrawlResult {
  company: string;
  pages: CrawledPage[];
  attempted: NonNullable<Kit["research"]>["attempted"];
  notes: string[];
}

interface LinkCandidate { url: string; label: string; score: number; depth: number }
const rankingTerms: Array<[RegExp, number]> = [
  [/\b(careers?|jobs?|join (us|the team)|opportunities)\b/i, 12],
  [/\b(hiring|interview|recruit(ing|ment)|selection|application process|how we hire)\b/i, 14],
  [/\b(handbook|people|culture|values|working here|engineering blog|life at)\b/i, 8],
  [/\b(about|company|mission|what we do|who we are|overview)\b/i, 6],
  [/\b(product|platform|solutions|services|technology)\b/i, 3],
];

export function getApexDomain(hostname: string): string {
  const clean = hostname.toLowerCase().replace(/^www\./, "");
  const parts = clean.split(".");
  if (parts.length <= 2) return clean;
  if (parts.length >= 3 && ["co", "com", "org", "net", "gov", "edu"].includes(parts[parts.length - 2]!)) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

export function cleanCompanyName(title: string, hostname: string): string {
  const hostPart = hostname.replace(/^www\./i, "").split(".")[0]?.replace(/[-_]/g, " ") || "";
  const hostCapitalized = hostPart ? (hostPart.charAt(0).toUpperCase() + hostPart.slice(1)).replace(/[.;,\s]+$/, "") : "Company";

  if (!title) return hostCapitalized;

  // Extract from phrases like "... at Google", "... with Google", "Careers at Google."
  const atMatch = title.match(/\b(?:at|with)\s+([A-Za-z0-9\s&]+?)(?:\.|\s*[-|–—:]|$)/i);
  if (atMatch && atMatch[1] && atMatch[1].trim().length > 1 && atMatch[1].trim().length < 35) {
    const candidate = atMatch[1].trim().replace(/[.;,\s]+$/, "");
    if (!/career|careers|job|jobs|work|opportunity|opportunities|position|role|team/i.test(candidate)) {
      return candidate.replace(/[.;,\s]+$/, "");
    }
  }

  // Remove common prefixes
  let cleaned = title
    .replace(/^(?:search for your career at|careers at|jobs at|welcome to|working at|home\s*[-|–—:])\s*/i, "")
    .split(/[|–—:]/)[0]
    ?.trim()
    .replace(/[.;,\s]+$/, "") ?? "";

  // If cleaned title still looks like a full sentence or is too long (> 30 chars), fall back to host name
  if (cleaned.length > 30 || /\b(career|careers|jobs|search|opportunities|welcome|home)\b/i.test(cleaned)) {
    return hostCapitalized.replace(/[.;,\s]+$/, "");
  }

  return (cleaned || hostCapitalized).replace(/[.;,\s]+$/, "");
}

function extractPage(html: string, baseUrl: string, depth: number): { title: string; text: string; links: LinkCandidate[] } {
  const $ = load(html);
  const title = ($("title").first().text() || $("h1").first().text()).trim().slice(0, 180);
  const baseDomain = getApexDomain(new URL(baseUrl).hostname);

  // 1. EXTRACT LINKS FIRST - BEFORE REMOVING NAV AND FOOTER!
  // Navigation headers and footers are where careers, about, culture, and team links live.
  const links: LinkCandidate[] = [];
  $("a[href]").each((_, element) => {
    const raw = $(element).attr("href");
    if (!raw || raw.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(raw)) return;
    try {
      const url = new URL(raw, baseUrl);
      if (!["http:", "https:"].includes(url.protocol)) return;
      // Allow links within the same organization apex domain (e.g. careers.google.com and www.google.com)
      if (getApexDomain(url.hostname) !== baseDomain) return;
      url.hash = "";
      const label = `${$(element).text()} ${$(element).attr("title") ?? ""} ${url.pathname}`.replace(/\s+/g, " ").trim();
      const score = rankingTerms.reduce((sum, [pattern, weight]) => sum + (pattern.test(label) ? weight : 0), 0);
      links.push({ url: url.toString(), label, score, depth: depth + 1 });
    } catch { return; }
  });

  // 2. NOW REMOVE NAV, FOOTER, SCRIPTS TO EXTRACT CLEAN BODY TEXT
  $("script, style, noscript, svg, iframe, nav, footer, form, [aria-hidden='true']").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 10000);

  return { title, text, links };
}

function blockedByRobots(path: string, content: string): boolean {
  const lines = content.split(/\r?\n/).map((line) => line.split("#")[0]?.trim() ?? "");
  let active = false;
  let disallow: string[] = [];
  let allow: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    const [keyRaw, ...valueParts] = line.split(":");
    const key = keyRaw?.trim().toLowerCase();
    const value = valueParts.join(":").trim();
    if (key === "user-agent") {
      if (active && disallow.some((rule) => path.startsWith(rule))) return !pathAllowed(path, disallow, allow);
      active = value === "*" || /traointerviewprepbot/i.test(value);
      disallow = [];
      allow = [];
      continue;
    }
    if (!active || !value) continue;
    if (key === "disallow") disallow.push(value);
    if (key === "allow") allow.push(value);
  }
  return active && !pathAllowed(path, disallow, allow);
}

function pathAllowed(path: string, disallow: string[], allow: string[]): boolean {
  const longestAllow = Math.max(0, ...allow.filter((rule) => path.startsWith(rule)).map((rule) => rule.length));
  const longestDeny = Math.max(0, ...disallow.filter((rule) => path.startsWith(rule)).map((rule) => rule.length));
  return longestAllow > 0 && longestAllow >= longestDeny || longestDeny === 0;
}

const hostLastRequest = new Map<string, number>();
async function pace(host: string): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, 700 - (now - (hostLastRequest.get(host) ?? 0)));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  hostLastRequest.set(host, Date.now());
}

async function fetchWithRetry(url: string, allowLocal: boolean, expectedHost: string, maxAttempts = 3, timeoutMs = 9000): Promise<{ url: string; html: string }> {
  let lastError: unknown;
  const expectedApex = getApexDomain(expectedHost);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await pace(new URL(url).host);
      const result = await fetchBounded(url, { allowLocal, maxBytes: 1_200_000, timeoutMs });
      const destApex = getApexDomain(new URL(result.url).hostname);
      if (destApex !== expectedApex && new URL(result.url).hostname.toLowerCase() !== expectedHost.toLowerCase()) {
        throw new AppError("CROSS_HOST_REDIRECT", "The company page redirected to a different organization domain.", 422);
      }
      if (result.response.status === 404) throw new AppError("SOURCE_NOT_FOUND", "The page returned 404.", 404);
      if (!result.response.ok) throw new AppError("SOURCE_HTTP_ERROR", `The source returned HTTP ${result.response.status}.`, 502);
      return { url: result.url, html: result.text };
    } catch (error) {
      lastError = error;
      if (error instanceof AppError && ["SOURCE_NOT_FOUND", "UNSUPPORTED_CONTENT_TYPE", "SOURCE_TOO_LARGE", "PRIVATE_URL_BLOCKED"].includes(error.code)) break;
      if (attempt < maxAttempts - 1) await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt) + Math.floor(Math.random() * 150)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Failed to fetch source after three attempts.");
}

export async function crawlCompanySite(
  companyUrl: string,
  options: { allowLocal?: boolean; maxPages?: number; maxFetchAttempts?: number; requestTimeoutMs?: number; onProgress?: (message: string) => void } = {},
): Promise<CrawlResult> {
  const allowLocal = options.allowLocal ?? false;
  const root = await assertPublicHttpUrl(companyUrl, allowLocal);
  const origin = root.origin;
  const pages: CrawledPage[] = [];
  const attempts: CrawlResult["attempted"] = [];
  const notes: string[] = [];
  let robots = "";
  let robotsChecked = false;

  try {
    const robotsUrl = new URL("/robots.txt", origin).toString();
    const result = await fetchBounded(robotsUrl, { allowLocal, maxBytes: 100_000, timeoutMs: options.requestTimeoutMs ?? 5000, accept: "text/plain" });
    robotsChecked = result.response.ok || result.response.status === 404 || result.response.status === 410;
    if (result.response.ok) robots = result.text;
  } catch (error) {
    attempts.push({ url: new URL("/robots.txt", origin).toString(), status: "skipped", reason: error instanceof Error ? error.message : "robots.txt could not be read" });
    notes.push("Robots policy could not be confirmed, so crawling was skipped.");
  }

  if (!robotsChecked) {
    return {
      company: cleanCompanyName("", root.hostname),
      pages: [],
      attempted: attempts,
      notes,
    };
  }

  if (blockedByRobots(`${root.pathname}${root.search}`, robots)) {
    attempts.push({ url: root.toString(), status: "skipped", reason: "Disallowed by robots.txt" });
    notes.push("The company URL is disallowed by robots.txt.");
    return {
      company: cleanCompanyName("", root.hostname),
      pages: [],
      attempted: attempts,
      notes,
    };
  }

  const maxAttempts = Math.max(1, Math.min(options.maxFetchAttempts ?? 3, 3));
  const requestTimeoutMs = Math.max(1000, Math.min(options.requestTimeoutMs ?? 9000, 9000));
  const first = await fetchWithRetry(root.toString(), allowLocal, root.hostname, maxAttempts, requestTimeoutMs);
  const firstPage = extractPage(first.html, first.url, 0);
  pages.push({ url: first.url, title: firstPage.title, text: firstPage.text, depth: 0 });
  attempts.push({ url: first.url, status: "used" });
  options.onProgress?.("Company page retrieved");

  // If the user provided a deep subpath (like /about/careers/applications/),
  // also add the root homepage and /about to the candidates queue so the crawler discovers what the company does!
  if (root.pathname !== "/" && root.pathname !== "") {
    try {
      const homeUrl = new URL("/", root.origin).toString();
      if (!firstPage.links.some((l) => l.url === homeUrl)) {
        firstPage.links.push({ url: homeUrl, label: "Company Home", score: 6, depth: 1 });
      }
      const aboutUrl = new URL("/about", root.origin).toString();
      if (!firstPage.links.some((l) => l.url === aboutUrl)) {
        firstPage.links.push({ url: aboutUrl, label: "About Us", score: 8, depth: 1 });
      }
    } catch {}
  }

  const maxPages = Math.max(1, Math.min(options.maxPages ?? 8, 16));
  const visited = new Set([first.url]);
  let queue = firstPage.links.sort((a, b) => b.score - a.score).filter((item) => item.score > 0).slice(0, maxPages * 3);

  while (queue.length && pages.length < maxPages) {
    queue.sort((a, b) => b.score - a.score || a.depth - b.depth);
    const candidate = queue.shift();
    if (!candidate || visited.has(candidate.url) || candidate.depth > 2) continue;
    visited.add(candidate.url);
    const url = new URL(candidate.url);

    if (blockedByRobots(`${url.pathname}${url.search}`, robots)) {
      attempts.push({ url: candidate.url, status: "skipped", reason: "Disallowed by robots.txt" });
      continue;
    }
    options.onProgress?.(`Checking ${url.pathname || url.host}`);
    try {
      const fetched = await fetchWithRetry(candidate.url, allowLocal, root.hostname, maxAttempts, requestTimeoutMs);
      const parsed = extractPage(fetched.html, fetched.url, candidate.depth);
      pages.push({ url: fetched.url, title: parsed.title, text: parsed.text, depth: candidate.depth });
      attempts.push({ url: fetched.url, status: "used" });
      if (candidate.depth < 2) queue.push(...parsed.links.filter((link) => link.score > 0));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Page could not be fetched";
      attempts.push({ url: candidate.url, status: "skipped", reason });
    }
  }

  if (!pages.some((page) => /career|hiring|interview|recruit/i.test(`${page.title} ${page.url}`))) {
    notes.push("No hiring or interview-process page was discovered in the pages that were accessible.");
  }

  const company = cleanCompanyName(firstPage.title, root.hostname);
  return { company, pages, attempted: attempts, notes };
}
