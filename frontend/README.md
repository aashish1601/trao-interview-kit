# Interview Kit — Frontend (`frontend/`)

> **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4 web interface for Interview Kit.**

This application provides the user interface for Interview Kit: registration and login, kit creation, real-time generation progress, interactive inline editing, partial category regeneration, study schedule viewing, and confidence-based flashcard practice.

---

## 🎨 What’s Inside & How We Built It

The frontend is built using Next.js 16 App Router with modern component architecture:

### 1. Application Pages (`app/`)
* **`app/page.tsx`**: High-converting, modern landing page with feature cards, visual workflow, and live preview mockups.
* **`app/login/page.tsx` & `app/register/page.tsx`**: Clean, accessible auth forms with client-side validation, password toggles, and friendly error alerts.
* **`app/dashboard/page.tsx`**: Private kit dashboard showing existing kits, generation trigger, and a collapsible **"Evaluator & Benchmark Tools"** section for testing sample batches.
* **`app/kits/[id]/page.tsx`**: Dynamic route loading the comprehensive 5-tab preparation workspace.

### 2. Interactive Workspace (`components/kit-workspace.tsx`)
The kit workspace gives candidates full interactive control over their preparation:
1. **Company Brief:** Overview, what the company does, and direct clickable links to sources crawled.
2. **Role Breakdown:** Seniority, core responsibilities, and requirements tagged with priority (`must-have` vs. `nice-to-have`).
3. **Question Bank:** Categorized questions (Technical, Behavioural, System Design, Company Fit).
   * **Inline Editing:** Edit any question title or answer outline — auto-saved immediately.
   * **Pinning:** Pin critical questions so they are never lost.
   * **Category Regeneration:** Regenerate a specific category while keeping all your edited and pinned questions intact.
4. **Practice Mode (Flashcards):** Active recall mode with **confidence-based spaced repetition**:
   * New and unreviewed cards appear first.
   * Rating confidence (1 to 5) moves difficult cards sooner in the queue so you practice weak spots before the interview.
   * Quick "Next question" button alongside "Reveal answer" for rapid self-testing.
5. **Study Schedule:** Clear day-by-day plan dividing your questions across your exact preparation timeline.

### 3. API Client & Security (`lib/api.ts`)
* Centralized API wrapper that handles `credentials: "include"` for session cookies.
* Automatically fetches and attaches the **`X-CSRF-Token`** header on all mutations (`POST`, `PATCH`, `DELETE`).
* Formats backend error codes into friendly user messages.

---

## 🔗 How It Connects to the Backend

Communication between the frontend and backend is handled seamlessly via **Next.js Server Rewrites** in `next.config.ts`:

```typescript
// frontend/next.config.ts
async rewrites() {
  let apiOrigin = (process.env.API_INTERNAL_URL || "http://localhost:4000").trim().replace(/\/+$/, "");
  if (!apiOrigin.startsWith("http://") && !apiOrigin.startsWith("https://")) {
    apiOrigin = `https://${apiOrigin}`;
  }
  return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
}
```

### Why this architecture is powerful:
* The user's browser **only talks to the same origin** (`/api/...`).
* Session cookies (`trao.sid`) are stored natively as first-party cookies without cross-site tracking blocks in Chrome, Safari, or Brave.
* In production on Vercel, simply set `API_INTERNAL_URL` to your live Railway backend URL.

---

## ⚙️ Environment Variables

Create a `.env.local` file based on `.env.example`:

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `API_INTERNAL_URL` | Backend URL used by Next.js server rewrites | `http://localhost:4000` (local) or `https://your-backend.up.railway.app` (production) |
| `NEXT_PUBLIC_API_URL` | Relative API path for client-side fetches | `/api` |

---

## 📦 Key Commands

```bash
# Install dependencies
npm ci

# Start Next.js development server on http://localhost:3000
npm run dev

# Run TypeScript type check
npx tsc --noEmit

# Build production bundle with Next.js Turbopack
npm run build

# Start production server
npm start
```
