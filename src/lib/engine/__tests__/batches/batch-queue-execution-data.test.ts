import { describe, it, expect, vi, afterEach } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx, runWorkflowFixture, makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.executionData";

describe("batch-queue execution-data — n8n-nodes-base.executionData", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Execution Data");
  });

  it("passes items through unchanged with pairedItem (acceptance: pass-through with one saved field)", async () => {
    const { out, ctx } = await runNodeWithCtx(
      TYPE,
      {
        operation: "save",
        dataToSave: {
          values: [{ key: "contact", value: "={{ $json.email }}" }],
        },
      },
      [{ email: "a@example.com" }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ email: "a@example.com" });
    expect(out[0][0].pairedItem).toEqual({ item: 0, input: 0 });
    expect(ctx.getAllCustomData()).toEqual({ contact: "a@example.com" });
  });

  it("evaluates multiple saved fields and coerces values to strings (acceptance: multiple saved fields)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { out, ctx } = await runNodeWithCtx(
      TYPE,
      {
        dataToSave: {
          values: [
            { key: "recordId", value: "={{ $json.id }}" },
            { key: "state", value: "={{ $json.status }}" },
          ],
        },
      },
      [{ id: 7, status: "ok" }],
    );
    expect(out[0][0].json).toEqual({ id: 7, status: "ok" });
    expect(out[0][0].pairedItem).toEqual({ item: 0, input: 0 });
    expect(warn).not.toHaveBeenCalled();
    expect(ctx.getAllCustomData()).toEqual({ recordId: "7", state: "ok" });
  });

  it("truncates over-length value to 512 chars and logs without throwing (acceptance: value truncation)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const longValue = "x".repeat(513);
    const { out, ctx } = await runNodeWithCtx(
      TYPE,
      {
        dataToSave: {
          values: [{ key: "k", value: longValue }],
        },
      },
      [{}],
    );
    expect(out[0][0].json).toEqual({});
    expect(out[0][0].pairedItem).toEqual({ item: 0, input: 0 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("value");
    const stored = ctx.getAllCustomData();
    expect(stored.k).toHaveLength(512);
    expect(stored.k).toBe("x".repeat(512));
  });

  it("truncates over-length key to 50 chars and logs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const longKey = "k".repeat(51);
    const out = await runNode(
      TYPE,
      {
        dataToSave: { values: [{ key: longKey, value: "v" }] },
      },
      [{}],
    );
    expect(out[0][0].json).toEqual({});
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("key");
  });

  it("emits a single empty item on empty input (acceptance: empty input)", async () => {
    const { out, ctx } = await runNodeWithCtx(
      TYPE,
      {
        operation: "save",
        dataToSave: { values: [{ key: "k", value: "v" }] },
      },
      [],
    );
    expect(out[0]).toEqual([{ json: {} }]);
    expect(ctx.getAllCustomData()).toEqual({});
  });

  it("does not throw with no parameters", async () => {
    const out = await runNode(TYPE, {}, [{ x: 1 }]);
    expect(out[0][0].json).toEqual({ x: 1 });
    expect(out[0][0].pairedItem).toEqual({ item: 0, input: 0 });
  });

  it("runs end-to-end in a workflow", async () => {
    const wf = makeWorkflow(
      [
        makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        makeNode({
          id: "2",
          name: "Set",
          type: "n8n-nodes-base.set",
          parameters: {
            mode: "manual",
            include: "none",
            fields: {
              values: [{ name: "email", type: "stringValue", stringValue: "a@example.com" }],
            },
          },
        }),
        makeNode({
          id: "3",
          name: "ExecData",
          type: TYPE,
          parameters: {
            operation: "save",
            dataToSave: {
              values: [{ key: "contact", value: "={{ $json.email }}" }],
            },
          },
        }),
      ],
      {
        Start: { main: [[{ node: "Set", type: "main", index: 0 }]] },
        Set: { main: [[{ node: "ExecData", type: "main", index: 0 }]] },
      },
    );

    const result = await runWorkflowFixture(wf, {});
    expect(result.success).toBe(true);
    expect(result.runData.ExecData?.status).toBe("success");
    expect(result.runData.ExecData?.items?.[0]).toHaveLength(1);
    expect(result.runData.ExecData?.items?.[0]?.[0]?.json).toEqual({
      email: "a@example.com",
    });
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.executionData")).toBe(canonical);
  });
});
