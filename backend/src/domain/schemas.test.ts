import { describe, expect, it } from "vitest";
import { validateKit } from "./schemas.js";

const kit = {
  source: { company: "Acme", company_url: "https://acme.example", role: "Engineer", location: "Remote", jd_chars: 400, researched_at: "2026-10-19T00:00:00.000Z", pages_used: ["https://acme.example"] },
  company_brief: { summary: "Acme builds software.", what_they_do: "Tools for teams.", sources: ["https://acme.example"] },
  role: { title: "Engineer", seniority: "Senior", responsibilities: ["Build services"], requirements: [{ id: "r1", text: "Node.js", kind: "technical", priority: "must" }] },
  questions: [{ id: "q1", requirement_ids: ["r1"], category: "technical", prompt: "Explain your Node work.", answer_outline: "Context, decision, outcome.", difficulty: 2 }],
  flashcards: [{ id: "f1", front: "What did you build?", back: "A service with Node.js.", requirement_ids: ["r1"] }],
  schedule: { days_available: 1, days: [{ day: 1, focus: "Practise Node.js", question_ids: ["q1"], minutes: 60 }] },
  coverage: { uncovered_requirement_ids: [], passes: 1 },
};

describe("Appendix A validation", () => {
  it("accepts a complete kit with exact integer durations and valid references", () => {
    expect(validateKit(kit).success).toBe(true);
  });
  it("rejects floats, unknown question IDs, and uncovered must-haves", () => {
    const bad = structuredClone(kit);
    bad.schedule.days[0]!.minutes = 60.5;
    bad.schedule.days[0]!.question_ids = ["q-missing"];
    bad.questions[0]!.requirement_ids = [];
    bad.coverage.uncovered_requirement_ids = ["r1"];
    const result = validateKit(bad);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.join(" ")).toMatch(/int|unknown question|must-have|coverage/i);
  });
  it("rejects renamed or extra structural fields", () => {
    const bad = { ...kit, companyBrief: kit.company_brief } as Record<string, unknown>;
    delete bad.company_brief;
    expect(validateKit(bad).success).toBe(false);
  });
});
