import { describe, it, expect } from "vitest";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.typeformTrigger";

const sampleFormResponse = {
  form_response: {
    definition: {
      fields: [
        { id: "field1", title: "What is your name?" },
        { id: "field2", title: "What is your email?" },
      ],
    },
    answers: [
      { field: { id: "field1" }, type: "text", text: "John Doe" },
      { field: { id: "field2" }, type: "email", email: "john@example.com" },
    ],
  },
};

const sampleInput = [{ json: sampleFormResponse }];

describe("batch-queue typeformTrigger — n8n-nodes-base.typeformTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Typeform Trigger");
  });

  it("emits simplified answers only (defaults: simplifyAnswers=true, onlyAnswers=true)", async () => {
    const out = await runNode(TYPE, {}, sampleInput);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      "What is your name?": "John Doe",
      "What is your email?": "john@example.com",
    });
  });

  it("emits full payload with simplified answers (simplifyAnswers=true, onlyAnswers=false)", async () => {
    const out = await runNode(
      TYPE,
      { simplifyAnswers: true, onlyAnswers: false },
      sampleInput,
    );
    expect(out[0][0].json).toHaveProperty("form_response");
    const fr = (out[0][0].json as Record<string, unknown>).form_response as Record<string, unknown>;
    expect(fr.answers).toEqual({
      "What is your name?": "John Doe",
      "What is your email?": "john@example.com",
    });
    expect((fr.definition as Record<string, unknown>).fields).toHaveLength(2);
  });

  it("emits raw answers keyed by field id (simplifyAnswers=false, onlyAnswers=true, v1.1+)", async () => {
    const out = await runNode(
      TYPE,
      { simplifyAnswers: false, onlyAnswers: true },
      sampleInput,
    );
    expect(out[0][0].json).toEqual({
      field1: { field: { id: "field1" }, type: "text", text: "John Doe" },
      field2: { field: { id: "field2" }, type: "email", email: "john@example.com" },
    });
  });

  it("emits full webhook payload as-is (simplifyAnswers=false, onlyAnswers=false)", async () => {
    const out = await runNode(
      TYPE,
      { simplifyAnswers: false, onlyAnswers: false },
      sampleInput,
    );
    expect(out[0][0].json).toEqual(sampleFormResponse);
  });

  it("throws when form_response is missing", async () => {
    await expect(runNode(TYPE, {}, [{ json: {} }])).rejects.toThrow(
      /Missing payload structure/,
    );
  });

  it("throws when definition is missing", async () => {
    await expect(
      runNode(TYPE, {}, [{ json: { form_response: { answers: [] } } }]),
    ).rejects.toThrow(/Missing payload structure/);
  });

  it("throws when answers is missing", async () => {
    await expect(
      runNode(TYPE, {}, [{ json: { form_response: { definition: { fields: [] } } } }]),
    ).rejects.toThrow(/Missing payload structure/);
  });
});
