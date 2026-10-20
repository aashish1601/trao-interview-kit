import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  FRONTEND_ORIGIN: z.string().default("http://localhost:3000"),
  COOKIE_SECURE: z.string().optional().default(""),
  COOKIE_SAME_SITE: z.enum(["lax", "none", "strict"]).optional().default("lax"),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/interview_prep"),
  SESSION_SECRET: z.string().min(24).default("development-secret-change-this-value"),
  SESSION_COOKIE_NAME: z.string().default("trao.sid"),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().default("gemini-1.5-flash"),
  GROQ_API_KEY: z.string().optional().default(""),
  GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),
  GROK_API_KEY: z.string().optional().default(""),
  GROK_MODEL: z.string().default("openai/gpt-oss-120b"),
  LLM_PROVIDER: z.enum(["auto", "groq", "grok", "gemini"]).default("auto"),
  TAVILY_API_KEY: z.string().optional().default(""),
  BRAVE_SEARCH_API_KEY: z.string().optional().default(""),
  ALLOW_LOCAL_COMPANY_URLS: z.string().default("false"),
  MAX_CRAWL_PAGES: z.coerce.number().int().min(1).max(16).default(8),
  MAX_JD_CHARS: z.coerce.number().int().min(100).max(100000).default(30000),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
}

const frontendOrigins = parsed.data.FRONTEND_ORIGIN.split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const cookieSecure = parsed.data.COOKIE_SECURE.toLowerCase() === "true"
  ? true
  : parsed.data.COOKIE_SECURE.toLowerCase() === "false"
    ? false
    : parsed.data.NODE_ENV === "production";

export const env = {
  ...parsed.data,
  frontendOrigins: frontendOrigins.length > 0 ? frontendOrigins : ["http://localhost:3000"],
  cookieSecure,
  cookieSameSite: parsed.data.COOKIE_SAME_SITE,
  allowLocalCompanyUrls: parsed.data.ALLOW_LOCAL_COMPANY_URLS.toLowerCase() === "true",
  isProduction: parsed.data.NODE_ENV === "production",
};
