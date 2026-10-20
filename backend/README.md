# Interview Kit API

The backend owns authentication, session storage, research, generation, schedule allocation, persistence, and Appendix A validation. It also exposes the mandatory batch entry point.

See the workspace [README](../README.md) for the full architecture, local setup, provider notes, source policy, security decisions, deployment instructions, and evaluation walkthrough. Backend commands:

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
npm test
npm run build
npm run evaluate -- --input .\cases.json --output .\kits.json
```

The batch command runs from this directory and does not require MongoDB. `GEMINI_API_KEY` and `BRAVE_SEARCH_API_KEY` are documented in `.env.example`; missing keys are handled as explicit degraded/partial research.
