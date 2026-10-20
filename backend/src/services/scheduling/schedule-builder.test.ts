import { describe, expect, it } from "vitest";
import { buildStudySchedule } from "./schedule-builder.js";
import type { Question, Requirement } from "../../domain/kit.js";

const requirements: Requirement[] = [
  { id: "r1", text: "Five years of Node.js experience", kind: "technical", priority: "must" },
  { id: "r2", text: "Mentor junior engineers", kind: "behavioural", priority: "must" },
  { id: "r3", text: "Experience with healthcare products", kind: "domain", priority: "nice" },
];
const questions: Question[] = [
  { id: "q1", requirement_ids: ["r1"], category: "technical", prompt: "Explain Node", answer_outline: "Example", difficulty: 3 },
  { id: "q2", requirement_ids: ["r2"], category: "behavioural", prompt: "Tell me about mentoring", answer_outline: "STAR", difficulty: 2 },
  { id: "q3", requirement_ids: ["r3"], category: "company-fit", prompt: "Healthcare experience?", answer_outline: "Context", difficulty: 1 },
];

describe("buildStudySchedule", () => {
  it.each([1, 5, 60])("allocates an exact %i-day schedule and places every question", (days) => {
    const schedule = buildStudySchedule(requirements, questions, days);
    expect(schedule.days_available).toBe(days);
    expect(schedule.days).toHaveLength(days);
    expect(schedule.days.map((day) => day.day)).toEqual(Array.from({ length: days }, (_, index) => index + 1));
    expect(schedule.days.flatMap((day) => day.question_ids).sort()).toEqual(["q1", "q2", "q3"]);
    expect(schedule.days.every((day) => Number.isInteger(day.minutes))).toBe(true);
    expect(schedule.days.flatMap((day) => day.question_ids)).toEqual(expect.arrayContaining(["q1", "q2"]));
  });

  it("places required and harder questions before nice-to-have material", () => {
    const schedule = buildStudySchedule(requirements, questions, 3);
    expect(schedule.days[0]?.question_ids).toContain("q1");
    expect(schedule.days[1]?.question_ids).toContain("q2");
    expect(schedule.days[2]?.question_ids).toContain("q3");
  });

  it("uses review days when there is more time than material", () => {
    const schedule = buildStudySchedule(requirements, questions.slice(0, 1), 5);
    expect(schedule.days.slice(1).every((day) => day.question_ids.length === 0)).toBe(true);
    expect(schedule.days.slice(1).every((day) => day.minutes > 0)).toBe(true);
  });
});
