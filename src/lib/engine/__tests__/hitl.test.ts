import { describe, expect, it } from "vitest";
import { applyHitlDecision, isHitlWait } from "../hitl";

describe("HITL decisions", () => {
  it("stamps approve/deny onto waiting items", () => {
    const out = applyHitlDecision([{ json: { id: 1 } }], "deny", "nope");
    expect(out[0]!.json).toEqual({ id: 1, approved: false, decision: "deny", comment: "nope" });
    expect(isHitlWait("webhook")).toBe(true);
    expect(isHitlWait("timeInterval")).toBe(false);
  });
});
