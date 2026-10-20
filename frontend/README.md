# Interview Kit frontend

Next.js 16, React, TypeScript, and Tailwind CSS 4 interface for the Interview Kit assessment. It includes registration/login, the kit dashboard, JSON batch upload, live generation progress, inline editing, regeneration, scheduling, and confidence-based flashcard practice.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Set `API_INTERNAL_URL` to the backend origin for the Next.js `/api` rewrite. See the workspace [README](../README.md) for backend setup, database, deployment, and assessment details.
