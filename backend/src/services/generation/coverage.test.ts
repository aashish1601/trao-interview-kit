import { describe, expect, it } from "vitest";
import { findUncoveredRequirements } from "./coverage.js";
import type { Question, Requirement } from "../../domain/kit.js";

describe("findUncoveredRequirements", () => {
  const requirements: Requirement[] = [
    { id: "r1", text: "Node.js", kind: "technical", priority: "must" },
    { id: "r2", text: "Mentoring", kind: "behavioural", priority: "must" },
  ];
  const question: Question = { id: "q1", requirement_ids: ["r1"], category: "technical", prompt: "Question", answer_outline: "Outline", difficulty: 2 };
  it("reports a requirement when no question references its stable id", () => {
    expect(findUncoveredRequirements(requirements, [question]).map((item) => item.id)).toEqual(["r2"]);
  });
  it("closes a gap when the targeted second-pass question links it", () => {
    const secondPass: Question = { ...question, id: "q2", requirement_ids: ["r2"], category: "behavioural" };
    expect(findUncoveredRequirements(requirements, [question, secondPass])).toEqual([]);
  });
});
