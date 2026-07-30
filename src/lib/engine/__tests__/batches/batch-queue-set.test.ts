import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runWorkflowFixture, makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.set";

describe("batch-queue set — n8n-nodes-base.set", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Edit Fields (Set)");
  });

  it("manual field + keep only set (include=none)", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "manual",
        include: "none",
        fields: {
          values: [
            { name: "greeting", type: "stringValue", stringValue: "={{ $json.name }}" },
          ],
        },
      },
      [{ name: "Alice", extra: 1 }],
    );
    expect(out[0][0].json).toEqual({ greeting: "Alice" });
  });

  it("manual field with include all + includeOtherFields", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "manual",
        include: "all",
        includeOtherFields: true,
        fields: {
          values: [
            { name: "greeting", type: "stringValue", stringValue: "={{ $json.name }}" },
          ],
        },
      },
      [{ name: "Alice", extra: 1 }],
    );
    expect(out[0][0].json).toEqual({ name: "Alice", extra: 1, greeting: "Alice" });
  });

  it("number type + expression coerces to number", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "manual",
        include: "none",
        fields: {
          values: [
            { name: "doubled", type: "numberValue", numberValue: "={{ $json.x * 2 }}" },
          ],
        },
      },
      [{ x: 10 }],
    );
    expect(out[0][0].json.doubled).toBe(20);
    expect(typeof out[0][0].json.doubled).toBe("number");
  });

  it("dot notation on nests the value", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "manual",
        include: "none",
        options: { dotNotation: true },
        fields: {
          values: [{ name: "number.one", type: "numberValue", numberValue: 20 }],
        },
      },
      [{}],
    );
    expect(out[0][0].json).toEqual({ number: { one: 20 } });
  });

  it("dot notation off keeps a flat key", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "manual",
        include: "none",
        options: { dotNotation: false },
        fields: {
          values: [{ name: "number.one", type: "numberValue", numberValue: 20 }],
        },
      },
      [{}],
    );
    expect(out[0][0].json).toEqual({ "number.one": 20 });
  });

  it("raw JSON merge with all input fields", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "raw",
        include: "all",
        includeOtherFields: true,
        jsonOutput:
          '{\n  "newKey": "new value",\n  "array": [{{ $json.id }},"{{ $json.name }}"],\n  "object": {\n    "innerKey1": "new value",\n    "innerKey2": "{{ $json.id }}",\n    "innerKey3": "{{ $json.name }}"\n  }\n}',
      },
      [{ id: "23423532", name: "Jay Gatsby", email: "gatsby@west-egg.com" }],
    );
    const json = out[0][0].json;
    expect(json.id).toBe("23423532");
    expect(json.name).toBe("Jay Gatsby");
    expect(json.email).toBe("gatsby@west-egg.com");
    expect(json.newKey).toBe("new value");
    expect(json.array).toEqual([23423532, "Jay Gatsby"]);
    expect(json.object).toEqual({
      innerKey1: "new value",
      innerKey2: "23423532",
      innerKey3: "Jay Gatsby",
    });
  });

  it("legacy keepOnlySet drops non-set fields (typeVersion 1)", async () => {
    const out = await runNode(
      TYPE,
      {
        keepOnlySet: true,
        values: { string: [{ name: "a", value: "z" }] },
      },
      [{ a: 1, b: 2 }],
    );
    expect(out[0][0].json).toEqual({ a: "z" });
  });

  it("include=selected keeps only listed input fields", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "manual",
        include: "selected",
        includeFields: "a, c",
        fields: {
          values: [{ name: "added", type: "stringValue", stringValue: "yes" }],
        },
      },
      [{ a: 1, b: 2, c: 3 }],
    );
    expect(out[0][0].json).toEqual({ a: 1, c: 3, added: "yes" });
  });

  it("include=except drops listed input fields", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "manual",
        include: "except",
        excludeFields: "b",
        fields: {
          values: [{ name: "added", type: "stringValue", stringValue: "yes" }],
        },
      },
      [{ a: 1, b: 2, c: 3 }],
    );
    expect(out[0][0].json).toEqual({ a: 1, c: 3, added: "yes" });
  });

  it("accepts assignments (v3.3+) as an alternative to fields", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "manual",
        include: "none",
        assignments: {
          assignments: [
            { name: "score", value: 85, type: "number" },
            { name: "label", value: "Alice", type: "string" },
          ],
        },
      },
      [{}],
    );
    expect(out[0][0].json).toEqual({ score: 85, label: "Alice" });
  });

it("runs end-to-end in a workflow and preserves pairedItem", async () => {
    const wf = makeWorkflow(
      [
        makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        makeNode({
          id: "2",
          name: "Set",
          type: TYPE,
          typeVersion: 3.4,
          parameters: {
            mode: "manual",
            include: "none",
            fields: {
              values: [{ name: "greeting", type: "stringValue", stringValue: "hello" }],
            },
          },
        }),
      ],
      { Start: { main: [[{ node: "Set", type: "main", index: 0 }]] } },
    );

    const result = await runWorkflowFixture(wf, {});
    expect(result.success).toBe(true);
    expect(result.runData.Set?.status).toBe("success");
    expect(result.runData.Set?.items?.[0][0].json).toEqual({ greeting: "hello" });
    expect(result.runData.Set?.items?.[0][0].pairedItem).toBeDefined();
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.set")).toBe(canonical);
  });
});