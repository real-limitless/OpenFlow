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

  it("marks limited (stub) when all scored types are unknown", () => {
    const r = scoreTemplateCompatibility([
      "n8n-nodes-base.definitelyDoesNotExistXYZ",
      "n8n-nodes-base.stickyNote",
    ]);
    expect(r.level).toBe("limited");
    expect(r.missing).toContain("n8n-nodes-base.definitelyDoesNotExistXYZ");
  });

  it("does not treat a description-only type as ready", () => {
    const r = scoreTemplateCompatibility([
      "n8n-nodes-base.httpRequest",
      "n8n-nodes-base.definitelyDoesNotExistXYZ",
    ]);
    expect(r.level).toBe("partial");
    expect(r.supported).toContain("n8n-nodes-base.httpRequest");
    expect(r.stub).toContain("n8n-nodes-base.definitelyDoesNotExistXYZ");
    expect(r.ratio).toBe(0.5);
  });

  it("treats unwired executors as partial, not ready", () => {
    const r = scoreTemplateCompatibility(["n8n-nodes-base.ldap"]);
    expect(r.level).toBe("partial");
    expect(r.partial).toContain("n8n-nodes-base.ldap");
    expect(r.supported).toHaveLength(0);
  });
});
