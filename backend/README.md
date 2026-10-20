# Interview Kit — Backend API (`backend/`)

> **Node.js 22 + Express 5 + TypeScript REST API and AI pipeline for Interview Kit.**

This service powers the entire intelligence behind the platform: company research crawling, LLM question generation, requirement coverage verification, study schedule allocation, user session management, and the headless batch CLI evaluator.

---

## 🛠️ What’s Inside & How We Built It

The backend is architected into clean, modular layers:

### 1. Domain & Strict Schemas (`src/domain/`)
* **Appendix A & B Contract Enforcement:** All inputs, kits, and batch results are validated against strict Zod schemas (`schemas.ts`). 
* No invalid enum, broken reference, or missing field can pass through to the database or output files.

### 2. Retrieval & Web Research Pipeline (`src/services/`)
* **`company-crawler.ts`**: Respects `robots.txt`, crawls only same-origin company links (ranking Careers, About, Team pages), caps retrieval at 8 pages and 1.2MB, and implements strict SSRF protection against loopback/private IPs.
* **`discussion-search.ts`**: Searches public interview discussions (via Tavily, Brave, or DuckDuckGo) for anecdotal candidate experiences without hallucinating fake interview rounds.

### 3. AI Generation & 2-Pass Gap Closure (`src/services/generation/`)
* **Role & Requirement Extractor:** Extracts hard technical, behavioural, and domain requirements with stable kit-local IDs and priority (`must` vs. `nice`).
* **Multi-Category Generator:** Prompts Groq (`openai/gpt-oss-120b` or `llama-3.3-70b-versatile`), Gemini, or Grok in targeted passes to produce relevant questions and flashcards.
* **2-Pass Coverage Algorithm (`coverage.ts`):** Evaluates requirement coverage in application code. If any requirement is uncovered, it triggers an automatic targeted second pass so 100% of must-haves are covered.

### 4. Smart Partial Regeneration (`merge-regeneration.ts`)
* Allows users to regenerate a specific question category (e.g., Technical) without overwriting questions they edited, added, or pinned. 
* Preserves monotonic IDs and reconciles schedule references automatically.

### 5. Study Schedule Builder (`src/services/scheduling/`)
* Dynamically allocates questions across exactly the requested number of days (1 to 60 days).
* Schedules must-haves and hardest questions earliest, reserving later days for practice and review.

---

## 🔗 How It Connects to the Frontend

* **Same-Origin Proxying:** The Next.js frontend rewrites `/api/*` requests to this backend at `http://localhost:4000` (locally) or `API_INTERNAL_URL` (in production).
* **Cookie-Based Sessions:** Authentication uses `express-session` with MongoDB (`connect-mongo`). The session cookie (`trao.sid`) is `httpOnly`, `path=/`, and uses `SameSite=lax`.
* **Double-Submit CSRF Protection:** All mutating endpoints (`POST`, `PATCH`, `DELETE`) require the `X-CSRF-Token` header, distributed via `/api/auth/csrf`.
* **CORS:** Configured with `FRONTEND_ORIGIN` to allow credentials from the frontend domain.

---

## ⚙️ Environment Variables

Create a `.env` file in this directory based on `.env.example`:

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `NODE_ENV` | Environment mode | `production` or `development` |
| `PORT` | API listening port | `4000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/interview_prep` |
| `SESSION_SECRET` | 32+ character random secret for sessions | Generated 64-char hex string |
| `FRONTEND_ORIGIN` | Allowed CORS origins (comma-separated) | `https://your-frontend.vercel.app,http://localhost:3000` |
| `COOKIE_SECURE` | Set `true` for HTTPS, `false` for HTTP | `true` |
| `COOKIE_SAME_SITE` | Cookie SameSite policy | `lax` |
| `GROQ_API_KEY` | High-speed LLM inference key | `gsk_...` |
| `GROQ_MODEL` | Groq model identifier | `openai/gpt-oss-120b` |

---

## 📦 Key Commands

```bash
# Install dependencies
npm ci

# Start development server with live reload
npm run dev

# Run all 18 Vitest unit and integration tests
npm test

# Check TypeScript compilation
npm run build

# Start production server
npm start

# Run the headless batch CLI evaluator
npm run evaluate -- --input ../cases.example.json --output ../kits.test.json
```
