import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runWorkflowFixture, makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.debugHelper";

describe("batch-queue debugHelper — n8n-nodes-base.debugHelper", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Debug Helper");
  });

  it("doNothing passes items through unchanged (acceptance: do nothing pass-through)", async () => {
    const out = await runNode(TYPE, { category: "doNothing" }, [{ foo: 1 }]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ foo: 1 });
  });

  it("doNothing emits empty item on empty input", async () => {
    const out = await runNode(TYPE, { category: "doNothing" }, []);
    expect(out[0]).toEqual([{ json: {} }]);
  });

  it("throwError throws NodeOperationError (acceptance: throw error)", async () => {
    await expect(
      runNode(TYPE, { category: "throwError", errorType: "NodeOperationError", errorMessage: "test error" }, [{}]),
    ).rejects.toThrow("test error");
  });

  it("throwError respects continueOnFail and emits error in item", async () => {
    const out = await runNode(
      TYPE,
      { category: "throwError", errorType: "NodeOperationError", errorMessage: "test error" },
      [{ x: 1 }],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toContain("test error");
  });

  it("generateRandomData with uuid produces UUID v4 items (acceptance: generate random UUIDs)", async () => {
    const out = await runNode(
      TYPE,
      { category: "generateRandomData", dataType: "uuid", seed: "test42", itemsToGenerate: 3, outputAsSingleArray: false },
      [{}],
    );
    expect(out[0]).toHaveLength(3);
    for (const item of out[0]) {
      expect(item.json.uuid).toBeDefined();
      expect(typeof item.json.uuid).toBe("string");
      expect(item.json.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it("generateRandomData with nanoids uses custom alphabet (acceptance: generate nanoids)", async () => {
    const out = await runNode(
      TYPE,
      {
        category: "generateRandomData",
        dataType: "nanoids",
        nanoidAlphabet: "ABC",
        nanoidLength: 4,
        seed: "test",
        itemsToGenerate: 2,
        outputAsSingleArray: false,
      },
      [{}],
    );
    expect(out[0]).toHaveLength(2);
    for (const item of out[0]) {
      expect(item.json.nanoid).toBeDefined();
      expect(item.json.nanoid).toHaveLength(4);
      expect(item.json.nanoid).toMatch(/^[ABC]+$/);
    }
  });

  it("generateRandomData with address as single array (acceptance: generate random data as single array)", async () => {
    const out = await runNode(
      TYPE,
      { category: "generateRandomData", dataType: "address", itemsToGenerate: 2, outputAsSingleArray: true, seed: "test42" },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect(Array.isArray(out[0][0].json.data)).toBe(true);
    expect(out[0][0].json.data).toHaveLength(2);
    expect(out[0][0].json.data[0]).toHaveProperty("street");
    expect(out[0][0].json.data[0]).toHaveProperty("city");
  });

  it("outOfMemory allocates memory", async () => {
    const out = await runNode(TYPE, { category: "outOfMemory", memorySize: 1 }, [{}]);
    expect(out[0][0].json.allocated).toBe(1);
  });

  it("generateRandomData with seed produces deterministic output", async () => {
    const out1 = await runNode(
      TYPE,
      { category: "generateRandomData", dataType: "address", seed: "fixed", itemsToGenerate: 1, outputAsSingleArray: false },
      [{}],
    );
    const out2 = await runNode(
      TYPE,
      { category: "generateRandomData", dataType: "address", seed: "fixed", itemsToGenerate: 1, outputAsSingleArray: false },
      [{}],
    );
    expect(out1[0][0].json).toEqual(out2[0][0].json);
  });

  it("runs end-to-end in a workflow", async () => {
    const wf = makeWorkflow(
      [
        makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        makeNode({
          id: "2",
          name: "Debug",
          type: TYPE,
          parameters: { category: "doNothing" },
        }),
      ],
      {
        Start: { main: [[{ node: "Debug", type: "main", index: 0 }]] },
      },
    );

    const result = await runWorkflowFixture(wf, {});
    expect(result.success).toBe(true);
    expect(result.runData.Debug?.status).toBe("success");
  });
});