import { describe, expect, it } from "vitest";
import {
  parseJsonStringArray,
  scoreTemplateCompatibility,
} from "../template-compat";

describe("template-compat", () => {
  it("parses JSON string arrays", () => {
    expect(parseJsonStringArray('["a","b"]')).toEqual(["a", "b"]);
    expect(parseJsonStringArray("not-json")).toEqual([]);
    expect(parseJsonStringArray(null)).toEqual([]);
  });

  it("ignores sticky notes and scores ready when empty", () => {
    const r = scoreTemplateCompatibility(["n8n-nodes-base.stickyNote"]);
    expect(r.level).toBe("ready");
    expect(r.total).toBe(0);
  });

  it("marks limited when all scored types are unknown", () => {
    const r = scoreTemplateCompatibility([
      "n8n-nodes-base.definitelyDoesNotExistXYZ",
      "n8n-nodes-base.stickyNote",
    ]);
    expect(r.level).toBe("limited");
    expect(r.missing).toContain("n8n-nodes-base.definitelyDoesNotExistXYZ");
  });
});
