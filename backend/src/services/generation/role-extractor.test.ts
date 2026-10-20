import { describe, expect, it } from "vitest";
import { fallbackExtractRole } from "./role-extractor.js";

describe("fallbackExtractRole", () => {
  it("keeps an explicit short requirement instead of dropping it with a short posting", () => {
    const result = fallbackExtractRole("Senior React Engineer\nRequired: 5 years of React experience");

    expect(result.title).toBe("Senior React Engineer");
    expect(result.requirements).toEqual([
      expect.objectContaining({
        id: "r1",
        text: "5 years of React experience",
        kind: "technical",
        priority: "must",
      }),
    ]);
  });

  it("does not invent requirements for a thin two-line posting", () => {
    const result = fallbackExtractRole("We are looking for a curious teammate\nJoin our team");

    expect(result.requirements).toEqual([]);
    expect(result.responsibilities).toEqual([]);
  });

  it("treats plain items under a requirements heading as must-haves", () => {
    const result = fallbackExtractRole("Backend Engineer\nRequirements:\n5+ years of Node.js experience\nBonus: Kubernetes experience");

    expect(result.requirements.map(({ priority }) => priority)).toEqual(["must", "nice"]);
  });
});
