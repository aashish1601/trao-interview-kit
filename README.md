# Interview Kit (FS-AI-INTERVIEW-01)

> **Turn any job posting into an honest, source-grounded interview preparation plan.**

Interview Kit takes a pasted Job Description, a Company Website, and your preparation timeline (1–60 days), and automatically builds:
1. **Company Brief:** Grounded in real pages crawled from the company website.
2. **Role Breakdown:** Requirements split into must-haves vs. nice-to-haves.
3. **Question Bank:** Categorized interview questions covering 100% of must-have requirements.
4. **Interactive Flashcards:** Active recall cards with an intelligent confidence-based review queue.
5. **Study Schedule:** Day-by-day plan calibrated to your exact preparation timeline.

---

## 🌐 Live Deployment

* **Frontend (Vercel):** [https://trao-interview-kit-six.vercel.app/](https://trao-interview-kit-six.vercel.app/)
* **Backend (Railway):** Node.js 22 & Express 5 API running in Docker on Railway.
* **Database (Railway):** Hosted MongoDB with persistent volume.

---

## 🚀 How We Built It (Tech Stack & Architecture)

The system is built as a clean, decoupled full-stack monorepo:

### 1. Frontend ([`frontend/`](frontend))
* **Framework:** Next.js 16 (App Router), React 19, TypeScript.
* **Styling:** Tailwind CSS 4, Lucide Icons, clean modern cards and micro-animations.
* **API Communication:** Next.js server rewrites proxy all `/api/*` traffic to the backend, enabling secure same-origin HTTP-only cookies without cross-site tracking issues.

### 2. Backend ([`backend/`](backend))
* **Runtime:** Node.js 22, Express 5, TypeScript.
* **Database:** MongoDB & Mongoose for users, kits, and background job queue state.
* **Authentication:** Secure stateful sessions with `express-session`, `connect-mongo`, `bcryptjs` password hashing, and double-submit **CSRF protection** (`X-CSRF-Token`).
* **Validation:** 100% strict Zod validation enforcing the **Appendix A** and **Appendix B** contracts.

### 3. AI & Search Pipeline
* **LLM Engine:** Groq API (`openai/gpt-oss-120b` or `llama-3.3-70b-versatile`) with support for Google Gemini and xAI Grok. Outputs are strictly parsed through Zod schemas with automatic recovery and deterministic fallbacks.
* **Bounded Crawler:** Crawls up to 8 pages per company, respects `robots.txt`, caps page size at 1.2MB, sets timeouts, and implements strict SSRF protection against loopback/internal IPs.
* **Anecdotal Research:** Multi-provider discussion search (Tavily, Brave, and DuckDuckGo) retrieves real public Glassdoor/Reddit interview feedback without hallucinating fake rounds.

---

## ⚡ How to Run the Batch Processor (CLI Evaluator)

The assessment requires a headless batch processor command that reads a JSON file of cases and writes an Appendix B output JSON file.

### Command:
From the project root:

```bash
npm run evaluate -- --input cases.example.json --output kits.test.json
```

Or from inside `backend/`:

```bash
cd backend
npm run evaluate -- --input ../cases.example.json --output ../kits.test.json
```

### Input Shape (`cases.json`):
```json
[
  {
    "id": "case-01",
    "jd": "Senior Backend Engineer\nWe are looking for Node.js and distributed systems expertise...",
    "company_url": "https://stripe.com",
    "days": 5
  }
]
```

### What it does:
* Runs completely standalone — **zero database or login required**.
* Processes cases sequentially to respect free-tier API quotas.
* Automatically recovers if a site is unreachable, recording research notes rather than failing the kit.
* Outputs the complete, validated **Appendix B** envelope to your output file.

---

## 💡 Key Design Decisions & Creative Feature

1. **Two-Pass Requirement Coverage Guarantee:**
   If any requirement from the job description lacks an interview question, the engine triggers an automatic second targeted pass to ensure all must-haves are covered.
2. **Smart Partial Regeneration (Preserves Your Work):**
   Users can edit questions or click the **Pin** icon. When regenerating a category (e.g. Technical), your edited and pinned questions are **preserved** while only unedited items refresh.
3. **Creative Feature: Confidence-Based Spaced Repetition Queue:**
   In **Practice Mode**, flashcards use an intelligent review queue:
   * Cards you have never seen appear first.
   * When you reveal an answer and rate your confidence (1 to 5), low-confidence cards return sooner in the queue.
   * High-confidence cards return later. This focuses limited prep time on weak spots.

---

## 💻 Local Development Setup

### Option A: Run with Docker Compose (Recommended)
Make sure Docker Desktop is running:

```bash
# 1. Start all containers (MongoDB, Backend, Frontend)
docker compose up --build

# 2. Open the web app
# http://localhost:3000
```
* Backend API health endpoint: `http://localhost:4000/api/health`
* To stop: `docker compose down`

---

### Option B: Run Services Directly

**Prerequisites:** Node.js 22+ and a local MongoDB instance running on port 27017.

```bash
# Terminal 1: Backend
cd backend
npm install
npm run dev
```

```bash
# Terminal 2: Frontend
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## 🧪 Tests & Quality Assurance

All core algorithms, requirement coverage, Appendix A validation, and edit-preserving regeneration are covered by unit and integration tests:

```bash
cd backend
npm test
```

* **Vitest Suite:** 7 test files, **18 passed (100%)**.
* **TypeScript:** Strict type checking (`tsc --noEmit`) with 0 errors across both frontend and backend.
* **Production Build:** Passes Next.js Turbopack build (`npm run build`) cleanly.
