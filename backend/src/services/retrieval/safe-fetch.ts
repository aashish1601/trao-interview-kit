import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { AppError } from "../../domain/errors.js";

const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 1_200_000;
const blockedRanges = new Set(["private", "loopback", "linkLocal", "uniqueLocal", "unspecified", "broadcast", "multicast", "reserved", "carrierGradeNat"]);

function classifyAddress(value: string): string {
  try {
    return ipaddr.process(value).range();
  } catch {
    return "invalid";
  }
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host.endsWith(".localhost");
}

export async function assertPublicHttpUrl(input: string, allowLocal = false): Promise<URL> {
  let url: URL;
  try { url = new URL(input); } catch { throw new AppError("INVALID_COMPANY_URL", "Enter a valid company website URL."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new AppError("INVALID_COMPANY_URL", "Only HTTP and HTTPS URLs without embedded credentials are supported.");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) {
    if (!allowLocal) throw new AppError("PRIVATE_URL_BLOCKED", "Local and private company URLs are blocked in production.", 400);
    return url;
  }
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = ipaddr.isValid(host)
      ? [{ address: ipaddr.process(host).toString(), family: ipaddr.process(host).kind() === "ipv4" ? 4 : 6 }]
      : await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new AppError("COMPANY_UNREACHABLE", "The company host could not be resolved.", 422);
  }
  if (!addresses.length) throw new AppError("COMPANY_UNREACHABLE", "The company host has no reachable address.", 422);
  for (const address of addresses) {
    const range = classifyAddress(address.address);
    if (range === "unicast") continue;
    if (allowLocal && range === "loopback") continue;
    if (blockedRanges.has(range)) throw new AppError("PRIVATE_URL_BLOCKED", "Company URLs must resolve to a public address.", 400);
    throw new AppError("PRIVATE_URL_BLOCKED", "The company host resolved to an unsupported address.", 400);
  }
  return url;
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new AppError("SOURCE_TOO_LARGE", `Source exceeds the ${maxBytes} byte limit.`, 413);
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: false }).decode(joined);
}

export async function fetchBounded(
  input: string,
  options: { allowLocal?: boolean; maxBytes?: number; timeoutMs?: number; accept?: string } = {},
): Promise<{ url: string; response: Response; text: string }> {
  const maxBytes = options.maxBytes ?? MAX_BODY_BYTES;
  let current = input;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const url = await assertPublicHttpUrl(current, options.allowLocal ?? false);
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs ?? 9000),
        headers: { "user-agent": "TraoInterviewPrepBot/1.0 (+company research; respect robots.txt)", accept: options.accept ?? "text/html, text/plain;q=0.9" },
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("SOURCE_TIMEOUT", "The source did not respond before the request timed out.", 504);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects === MAX_REDIRECTS) throw new AppError("SOURCE_REDIRECT_LIMIT", "The source redirected too many times.", 422);
      current = new URL(location, url).toString();
      continue;
    }
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > maxBytes) throw new AppError("SOURCE_TOO_LARGE", `Source exceeds the ${maxBytes} byte limit.`, 413);
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("text/plain") && response.ok) {
      throw new AppError("UNSUPPORTED_CONTENT_TYPE", `Skipped unsupported content type: ${contentType || "unknown"}.`, 415);
    }
    const text = response.ok ? await readBoundedBody(response, maxBytes) : "";
    return { url: url.toString(), response, text };
  }
  throw new AppError("SOURCE_REDIRECT_LIMIT", "The source redirected too many times.", 422);
}
