import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.jotFormTrigger";

describe("batch-queue jotFormTrigger — n8n-nodes-base.jotFormTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Jotform Trigger");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(getExecutor("nodes-base.jotFormTrigger")).toBe(canonical);
  });

  it("answers-only output (default) strips metadata envelope", async () => {
    const out = await runNode(
      TYPE,
      { form: "123456789" },
      [
        {
          formID: "123456789",
          submissionID: "6055023196465256193",
          type: "WEB",
          ip: "1.2.3.4",
          rawRequest: JSON.stringify({
            q3_name: { first: "Kin", last: "Lane" },
            q4_email: "kin@example.com",
          }),
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      q3_name: { first: "Kin", last: "Lane" },
      q4_email: "kin@example.com",
    });
  });

  it("full payload with metadata when onlyAnswers=false", async () => {
    const out = await runNode(
      TYPE,
      { form: "123456789", onlyAnswers: false, resolveData: false },
      [
        {
          formID: "123456789",
          submissionID: "6055023196465256193",
          type: "WEB",
          rawRequest: JSON.stringify({
            q3_name: { first: "Kin", last: "Lane" },
            q4_email: "kin@example.com",
          }),
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.formID).toBe("123456789");
    expect(out[0][0].json.submissionID).toBe("6055023196465256193");
    expect(out[0][0].json.type).toBe("WEB");
    expect(out[0][0].json.answers).toEqual({
      q3_name: { first: "Kin", last: "Lane" },
      q4_email: "kin@example.com",
    });
  });

  it("resolves question IDs to labels when resolveData=true and questionMap provided", async () => {
    const out = await runNode(
      TYPE,
      { form: "123456789", resolveData: true, questionMap: { q3_name: "Name", q4_email: "Email" } },
      [
        {
          formID: "123456789",
          rawRequest: JSON.stringify({
            q3_name: { first: "Kin", last: "Lane" },
            q4_email: "kin@example.com",
          }),
        },
      ],
    );

    expect(out[0][0].json).toEqual({
      Name: { first: "Kin", last: "Lane" },
      Email: "kin@example.com",
    });
  });

  it("handles malformed rawRequest gracefully", async () => {
    const out = await runNode(
      TYPE,
      { form: "123456789" },
      [
        {
          formID: "123456789",
          rawRequest: "not-json",
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({});
  });

  it("skips items with missing rawRequest", async () => {
    const out = await runNode(
      TYPE,
      { form: "123456789" },
      [
        {
          formID: "123456789",
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({});
  });

  it("preserves binary data on the output item", async () => {
    const { runNodeWithCtx } = await import("../helpers");
    const { out } = await runNodeWithCtx(
      TYPE,
      { form: "123456789" },
      [
        {
          json: {
            formID: "123456789",
            rawRequest: JSON.stringify({ q1: "value" }),
          },
          binary: {
            data: { data: "dGVzdA==", mimeType: "text/plain", fileName: "test.txt" },
          },
        },
      ],
    );

    expect(out[0][0].binary).toEqual({
      data: { data: "dGVzdA==", mimeType: "text/plain", fileName: "test.txt" },
    });
  });
});
