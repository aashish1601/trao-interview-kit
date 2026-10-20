import { describe, expect, it } from "vitest";
import type { Kit, Question } from "../../domain/kit.js";
import { createEditState, mergeRegeneratedSection } from "./merge-regeneration.js";

function makeKit(): Kit {
  return {
    source: { company: "Acme", company_url: "https://acme.example", role: "Engineer", location: "Remote", jd_chars: 300, researched_at: "2026-10-19T00:00:00.000Z", pages_used: ["https://acme.example"] },
    company_brief: { summary: "My edited company summary", what_they_do: "A company", sources: ["https://acme.example"] },
    role: { title: "Engineer", seniority: "Senior", responsibilities: [], requirements: [
      { id: "r1", text: "Node.js", kind: "technical", priority: "must" },
      { id: "r2", text: "Mentoring", kind: "behavioural", priority: "must" },
    ] },
    questions: [
      { id: "q1", requirement_ids: ["r1"], category: "technical", prompt: "Old generated", answer_outline: "Outline", difficulty: 2 },
      { id: "q2", requirement_ids: ["r2"], category: "behavioural", prompt: "Hand written", answer_outline: "STAR", difficulty: 2 },
    ],
    flashcards: [],
    schedule: { days_available: 2, days: [
      { day: 1, focus: "Core day one", question_ids: ["q1"], minutes: 45 },
      { day: 2, focus: "Core day two", question_ids: ["q2"], minutes: 35 },
    ] },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  };
}

describe("mergeRegeneratedSection", () => {
  it("replaces generated questions but preserves a hand-written edited question and unrelated edits", () => {
    const kit = makeKit();
    const state = createEditState(kit);
    state.items.q2 = { origin: "user", edited: true, pinned: false };
    state.sections.company_brief = { edited: true, pinned: false };
    const generatedQuestion: Omit<Question, "id"> = { requirement_ids: ["r1"], category: "technical", prompt: "Fresh generated", answer_outline: "A new outline", difficulty: 3 };
    const result = mergeRegeneratedSection(kit, state, "technical", { questions: [{ ...generatedQuestion, id: "draft1" }] });
    expect(result.kit.questions.map((item) => item.id)).toEqual(["q2", "q3"]);
    expect(result.kit.questions.find((item) => item.id === "q2")?.prompt).toBe("Hand written");
    expect(result.kit.questions.find((item) => item.id === "q3")?.prompt).toBe("Fresh generated");
    expect(result.kit.company_brief.summary).toBe("My edited company summary");
    expect(result.kit.schedule.days.flatMap((day) => day.question_ids).sort()).toEqual(["q2", "q3"]);
  });

  it("keeps pinned questions through category regeneration", () => {
    const kit = makeKit();
    const state = createEditState(kit);
    state.items.q1 = { origin: "generated", edited: false, pinned: true };
    const result = mergeRegeneratedSection(kit, state, "technical", { questions: [{ id: "draft", requirement_ids: ["r1"], category: "technical", prompt: "New", answer_outline: "New", difficulty: 2 }] });
    expect(result.kit.questions.map((item) => item.id)).toContain("q1");
    expect(result.kit.questions.map((item) => item.id)).toContain("q2");
  });

  it("replaces generated flashcards but preserves user-created or edited cards", () => {
    const kit = makeKit();
    kit.flashcards = [
      { id: "f1", front: "Old generated", back: "Old back", requirement_ids: ["r1"] },
      { id: "f2", front: "User created card", back: "User back", requirement_ids: ["r2"] },
    ];
    const state = createEditState(kit);
    state.items.f2 = { origin: "user", edited: true, pinned: false };
    const freshCards = [{ id: "draft1", front: "New concept", back: "New key points", requirement_ids: ["r1"] }];
    const result = mergeRegeneratedSection(kit, state, "flashcards", { flashcards: freshCards });
    expect(result.kit.flashcards.map((card) => card.id)).toEqual(["f2", "f3"]);
    expect(result.kit.flashcards.find((card) => card.id === "f2")?.front).toBe("User created card");
    expect(result.kit.flashcards.find((card) => card.id === "f3")?.front).toBe("New concept");
  });
});
