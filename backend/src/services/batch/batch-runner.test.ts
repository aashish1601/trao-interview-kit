import { describe, expect, it } from "vitest";
import type { BuildResult } from "../generation/kit-builder.js";
import { runBatchCases } from "./batch-runner.js";

const sampleResult = { kit: { source: { company: "Example" } }, researchContext: { company: "Example", pages: [], discussion: [] }, degraded: true } as unknown as BuildResult;

describe("runBatchCases", () => {
  it("records failures per case and continues with later cases in input order", async () => {
    const visited: number[] = [];
    const output = await runBatchCases([
      { id: "invalid", jd: "", company_url: "not a url", days: 0 },
      { id: "bad-run", jd: "A valid description", company_url: "https://example.test", days: 1 },
      { id: "good", jd: "A valid description", company_url: "https://example.test", days: 60 },
    ], async (input) => {
      visited.push(input.days);
      if (input.id === "bad-run") throw new Error("provider unavailable");
      return sampleResult;
    });
    expect(output.version).toBe("1.0");
    expect(output.kits.map((entry) => entry.id)).toEqual(["invalid", "bad-run", "good"]);
    expect(output.kits.map((entry) => entry.status)).toEqual(["failed", "failed", "ok"]);
    expect(output.kits[0]?.error?.code).toBe("INPUT_INVALID");
    expect(output.kits[1]?.error?.message).toBe("provider unavailable");
    expect(visited).toEqual([1, 60]);
  });
});
