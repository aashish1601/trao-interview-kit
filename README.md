# Interview Kit

Interview Kit turns a pasted job description, company website, and number of days into a source-grounded company brief, role breakdown, interview question bank, flashcards, and exact-length study schedule. The user can edit the draft, practise cards, and regenerate one section while preserving edits elsewhere.

This workspace has two separately installable applications: [`frontend/`](frontend) and [`backend/`](backend). The backend owns the Appendix A kit contract and the generation pipeline. It also owns the mandatory batch command.

## Stack

- **Frontend:** Next.js 16 App Router, React, TypeScript, Tailwind CSS 4.
- **Backend:** Node.js 22, Express 5, TypeScript, MongoDB and Mongoose.
- **Authentication:** bcrypt password hashes, Mongo-backed sessions, HTTP-only cookies, CSRF tokens, credentialed CORS, and per-user query scoping.
- **LLM:** Groq API (default model `llama-3.3-70b-versatile`), with support for xAI Grok (`grok-2-latest`) and Google Gemini (`gemini-1.5-flash`). Groq provides a generous free tier with high token throughput and ultra-fast inference (no billing card required at [console.groq.com](https://console.groq.com/keys)). The client validates all output locally against strict Zod schemas and has deterministic fallback behavior when a key is absent, JSON is invalid, or the provider encounters rate limits.
- **Public discussion search:** Multi-provider search with automatic zero-configuration fallback. Supports Tavily API (`TAVILY_API_KEY`, 1,000 free searches/month, no credit card required at [tavily.com](https://tavily.com)) and Brave Search API (`BRAVE_SEARCH_API_KEY`). When no search key is configured, the system uses a built-in free web search adapter to retrieve public Reddit and Glassdoor interview discussions, ensuring zero barrier to entry. Without results, the source is honestly marked skipped rather than hallucinating fake rounds.

The app uses a long-running Express process plus a Mongo-backed job queue. This keeps generation out of the request-response cycle while avoiding a separate queue service for the assessment. The frontend polls persisted progress and can reopen a kit later.

## Local setup

Requirements: Node.js 22.19 or newer, npm, Docker Desktop (or a MongoDB instance), and optionally free-tier Gemini and Brave keys.

### Run with Docker Compose

From this workspace root:

1. Copy `.env.example` to `.env` and replace `SESSION_SECRET` with a long random value. Add the Gemini and Brave keys if available.
2. Run `docker compose up --build`.
3. Open `http://localhost:3000`. The API health endpoint is `http://localhost:4000/api/health`.

MongoDB data is stored in a named Docker volume. To stop the services, run `docker compose down`. To remove the local database as well, run `docker compose down -v`.

### Run the services directly

Start MongoDB at `mongodb://127.0.0.1:27017/interview_prep`. Then, in separate terminals:

```powershell
cd backend
npm ci
Copy-Item .env.example .env
npm run dev
```

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Set `SESSION_SECRET` in `backend/.env` to a random value. Add `GEMINI_API_KEY` and `BRAVE_SEARCH_API_KEY` for live generation and public discussion search. No credentials are committed. With either key missing, the pipeline records the skipped/degraded step and produces a validated fallback kit where possible.

## Batch evaluator

Run the exact assessment command from the workspace root or from `backend/`:

```powershell
npm --prefix backend ci
Copy-Item backend/.env.example backend/.env
npm run evaluate -- --input .\cases.json --output .\kits.json
```

The command can also be run after `cd backend` using `npm run evaluate -- --input .\cases.json --output .\kits.json`.

The command does not need MongoDB or authentication. It reads an array of `{ "id", "jd", "company_url", "days" }`, calls the same `buildKit` pipeline used by the API, and writes one result per row using Appendix B's envelope. Cases run sequentially to protect free-tier quotas; an invalid or failed case is recorded and later cases continue. For the 15-minute assessment limit, batch mode shares provider clients across cases, paces requests, caps crawling at six pages with two six-second attempts per fetch, and switches remaining model work to deterministic fallbacks after repeated provider failures. The evaluator permits loopback hostnames for local test sites; the production web API does not. Configure credentials in `backend/.env`. Empty LLM/search credentials are valid and result in the documented fallback/skip behavior.

Example input:

```json
[
  {
    "id": "case-01",
    "jd": "Senior Backend Engineer\n\nWe are looking for ...",
    "company_url": "http://localhost:8099/acme/",
    "days": 5
  }
]
```

Output is `{ "version": "1.0", "generated_at": "...", "kits": [...] }`. Each successful kit uses Appendix A's field names and types. A missing hiring page or empty discussion search is partial research with notes, not a failed case. A case is `failed` only when the pipeline cannot produce a valid kit.

## Pipeline and data decisions

1. Validate the pasted JD, HTTP(S) URL, and 1–60 day range. The JD is never fetched from a job board.
2. Extract only stated role details and requirements. Each requirement gets a stable kit-local ID, `kind` and `must`/`nice` priority. Short descriptions remain thin instead of receiving invented requirements.
3. Fetch `robots.txt`, read the homepage, extract same-origin links, rank them by anchor/path/title signals, and crawl the most relevant links within a small budget. The crawler does not assume fixed hiring paths. It limits content to HTML/text, 1.2 MB per response, eight pages by default, short timeouts, and three retries with backoff.
4. Search public interview discussion with company-specific queries. Public posts are treated as anecdotal, not as official hiring policy.
5. Generate the company brief from retrieved text and search snippets. Site content and the JD are untrusted data, never model instructions. The model has no tools or browsing access.
6. Generate relevant technical, behavioural, system-design, and company-fit categories in separate calls. Every question must reference valid requirement IDs.
7. Compute coverage in application code. If any requirement has no question, run a targeted second pass; recheck the links, then add a plain deterministic fallback question for any remaining gap. The coverage field records the pass count and uncovered IDs.
8. Allocate every question across exactly the requested number of days in code. Must-have and harder questions sort first. Day duration is an integer; unused days become review days.
9. Validate the final kit before storage or output: exact required fields, enum values, integer durations, unique IDs, valid cross-references, exact day count, all questions scheduled, and no uncovered must-have.

Generated/edited/pinned state is stored as metadata next to the kit. Regenerating a question category replaces unedited generated items but keeps user-written, edited, and pinned questions; IDs are monotonic and are not reused. The schedule's question references are reconciled when a category changes. Regenerating a brief or schedule keeps an edited/pinned section unless the user confirms replacement. Unrelated kit sections and practice history are retained.

Practice uses a simple confidence sort: never-reviewed cards first, then lowest confidence, then oldest review. This keeps the rule visible and easy to explain rather than introducing an interval model that is difficult to validate in a short assessment.

## Security and source policy

The API rejects malformed URLs, credentials embedded in URLs, and private/loopback/link-local destinations in production. Each redirect is revalidated. The evaluator allows only loopback/local test hosts for the assessment's local fixtures. Retrieval is limited by content type, bytes, page count, timeout, and robots policy. User passwords are hashed; session cookies are HTTP-only and secure in production; writes require a CSRF token; API queries are always scoped to the signed-in user. Logs omit passwords, secrets, cookies, and full job descriptions.

Company information comes from the user-provided company site. Interview-process discussion comes from Brave Search API result snippets and their public source URLs. The crawler follows robots.txt and does not crawl job boards, social networks, or search result pages. Company-page links that cannot be fetched are stored in `research.attempted` with a reason.

## Tests and commands

Backend checks:

```powershell
cd backend
npm test
npm run build
```

Tests cover schedule allocation at 1, 5, and 60 days, requirement coverage, Appendix A validation, edit-preserving regeneration, batch continuation after a failed case, and an end-to-end company crawl against a local HTTP fixture.

Frontend checks:

```powershell
cd frontend
npx tsc --noEmit
npm run lint
npm run build
```

## Deployment

The Dockerfiles produce independent frontend and backend images; `docker-compose.yml` is for local review. Deploy the frontend and backend as long-running Node services and MongoDB on a managed Mongo provider. Set all values from the relevant `.env.example` in the hosting provider's secret/environment settings. Set the API's `FRONTEND_ORIGIN` to the public frontend origin, `MONGODB_URI` to the production database, and use a strong session secret. The Next.js rewrite proxies `/api/*` to `API_INTERNAL_URL` so the browser can use a same-origin cookie. Configure both the public frontend and `https://<api-host>/api/health` to be reachable. Do not expose the database port publicly.

This workspace contains deployment configuration but no hosting account, production API keys, or domain credentials. Those account-specific values must be added in the deployment dashboard before public URLs can be created.

## Known limitations and trade-offs

- Free-tier quotas vary. Provider 429/5xx responses use bounded retries, `Retry-After`, shared batch pacing, and deterministic fallbacks; a long provider outage can make the kit less specific.
- Without `BRAVE_SEARCH_API_KEY`, the public-discussion step is honestly reported as skipped.
- `robots.txt` parsing implements common user-agent, allow, and disallow path rules; it is not a complete crawler framework.
- Search-result snippets are not a substitute for reading every linked post. Results are attributed as anecdotal and linked for user review.
- The worker uses MongoDB as its queue and one generation at a time per process to keep rate limits controlled. Large multi-tenant workloads would need a dedicated worker deployment and queue observability.
- A generated kit is a draft. The interface keeps its edits and shows sources so the user can correct assumptions before relying on it.

## Submission walkthrough

The walkthrough should show: create a kit from a pasted posting and company URL; progress through research, generation, and a gap-closing pass; edit and reorder a question then regenerate its category; practise flashcards and confidence-sort the next review; inspect the day-by-day schedule; and explain one design decision plus the optional weak-spot feedback. The current creative feature is a confidence-based weak-card queue in Practice mode.
