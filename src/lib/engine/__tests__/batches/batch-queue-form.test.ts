import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runWorkflowFixture, makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.form";

describe("batch-queue form — n8n-nodes-base.form", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("n8n Form");
  });

  it("single-field form page merges default value into item (acceptance: single-field)", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "form",
        formFields: {
          values: [
            { fieldLabel: "Name", fieldName: "name", fieldType: "text", requiredField: true, defaultValue: "Jane Doe" },
          ],
        },
      },
      [{ email: "a@b.com", submittedAt: "2026-07-30T12:00:00.000Z" }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      email: "a@b.com",
      submittedAt: "2026-07-30T12:00:00.000Z",
      name: "Jane Doe",
    });
  });

  it("completion page passes through unchanged (acceptance: completion)", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "completion",
        completionTitle: "Thank You",
        completionMessage: "Your feedback has been received.",
      },
      [{ name: "Jane", feedback: "Great!" }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ name: "Jane", feedback: "Great!" });
  });

  it("hidden field passes through without display (acceptance: hidden field)", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "form",
        formFields: {
          values: [
            { fieldLabel: "ref", fieldName: "refId", fieldType: "hiddenField", fieldValue: "abc-123" },
          ],
        },
      },
      [{}],
    );
    expect(out[0][0].json).toHaveProperty("refId", "abc-123");
  });

  it("emits a single empty item on empty input", async () => {
    const out = await runNode(TYPE, { operation: "form" }, []);
    expect(out[0]).toEqual([{ json: {} }]);
  });

  it("runs end-to-end in a workflow", async () => {
    const wf = makeWorkflow(
      [
        makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        makeNode({
          id: "2",
          name: "Form",
          type: TYPE,
          parameters: {
            operation: "form",
            formFields: {
              values: [{ fieldName: "note", fieldType: "text", defaultValue: "hello" }],
            },
          },
        }),
      ],
      {
        Start: { main: [[{ node: "Form", type: "main", index: 0 }]] },
      },
    );

    const result = await runWorkflowFixture(wf, {});
    expect(result.success).toBe(true);
    expect(result.runData.Form?.status).toBe("success");
    expect(result.runData.Form?.items?.[0]).toHaveLength(1);
    expect(result.runData.Form?.items?.[0][0].json).toHaveProperty("note", "hello");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.form")).toBe(canonical);
  });
});