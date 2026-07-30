import { describe, it, expect, beforeEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.localFileTrigger";

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  executionId = "exec-lfs",
): ExecutionContext {
  const workflow = {
    id: "wf",
    name: "Test",
    active: false,
    nodes: [node],
    connections: {},
    settings: {},
    __executionId: executionId,
  };
  return createExecutionContext({
    node,
    workflow: workflow as unknown as Parameters<typeof createExecutionContext>[0]["workflow"],
    getNodeInputItems: () => items,
    continueOnFail: false,
  });
}

async function runTrigger(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  opts: { executionId?: string } = {},
) {
  const node = makeNode({
    name: "Local File Trigger",
    type: TYPE,
    parameters,
  });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, node, opts.executionId ?? "exec-lfs");
  const executor = getExecutor(TYPE)!;
  return { node, ctx, out: await executor(ctx, node) };
}

describe("batch-queue localFileTrigger — n8n-nodes-base.localFileTrigger", () => {
  beforeEach(() => {
    seedBuiltinExecutors();
    seedBuiltinDescriptions();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Local File Trigger");
  });

  it("file mode — change fires once (happy path)", async () => {
    const { out } = await runTrigger(
      { triggerOn: "file", path: "/data/invoices/1.pdf", options: {} },
      [{ event: "change", path: "/data/invoices/1.pdf" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      event: "change",
      path: "/data/invoices/1.pdf",
    });
  });

  it("file mode — normalizes any event on the watched path to 'change'", async () => {
    const { out } = await runTrigger(
      { triggerOn: "file", path: "/data/invoices/1.pdf", options: {} },
      [{ event: "add", path: "/data/invoices/1.pdf" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      event: "change",
      path: "/data/invoices/1.pdf",
    });
  });

  it("file mode — ignores events on other paths", async () => {
    const { out } = await runTrigger(
      { triggerOn: "file", path: "/data/invoices/1.pdf", options: {} },
      [{ event: "change", path: "/data/invoices/other.pdf" }],
    );

    expect(out[0]).toHaveLength(0);
  });

  it("folder mode — file added only (change filtered out)", async () => {
    const { out } = await runTrigger(
      {
        triggerOn: "folder",
        path: "/data/invoices",
        events: ["add"],
        options: { ignoreInitial: true, depth: -1 },
      },
      [
        { event: "add", path: "/data/invoices/new.pdf" },
        { event: "change", path: "/data/invoices/old.pdf" },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      event: "add",
      path: "/data/invoices/new.pdf",
    });
  });

  it("ignore pattern (match mode) — drops matching glob", async () => {
    const { out } = await runTrigger(
      {
        triggerOn: "folder",
        path: "/data/invoices",
        events: ["add", "change"],
        options: {
          ignored: "**/*.tmp",
          ignoreMode: "match",
          ignoreInitial: true,
        },
      },
      [
        { event: "add", path: "/data/invoices/scratch.tmp" },
        { event: "add", path: "/data/invoices/real.pdf" },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      event: "add",
      path: "/data/invoices/real.pdf",
    });
  });

  it("ignore subdirectory tree — no execution", async () => {
    const { out } = await runTrigger(
      {
        triggerOn: "folder",
        path: "/data/invoices",
        events: ["add"],
        options: {
          ignored: "**/myDirectory/**",
          ignoreMode: "match",
        },
      },
      [{ event: "add", path: "/data/invoices/myDirectory/nested.txt" }],
    );

    expect(out[0]).toHaveLength(0);
  });

  it("ignore mode contain — drops paths containing substring", async () => {
    const { out } = await runTrigger(
      {
        triggerOn: "folder",
        path: "/data/invoices",
        events: ["add"],
        options: {
          ignored: "scratch",
          ignoreMode: "contain",
        },
      },
      [
        { event: "add", path: "/data/invoices/scratch.tmp" },
        { event: "add", path: "/data/invoices/real.pdf" },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      event: "add",
      path: "/data/invoices/real.pdf",
    });
  });

  it("depth top folder only — drops nested entries", async () => {
    const { out } = await runTrigger(
      {
        triggerOn: "folder",
        path: "/data/invoices",
        events: ["add"],
        options: { depth: 0, ignoreInitial: true },
      },
      [
        { event: "add", path: "/data/invoices/top.pdf" },
        { event: "add", path: "/data/invoices/sub/nested.pdf" },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      event: "add",
      path: "/data/invoices/top.pdf",
    });
  });

  it("depth 1 — allows one level down", async () => {
    const { out } = await runTrigger(
      {
        triggerOn: "folder",
        path: "/data/invoices",
        events: ["add"],
        options: { depth: 1 },
      },
      [
        { event: "add", path: "/data/invoices/top.pdf" },
        { event: "add", path: "/data/invoices/sub/nested.pdf" },
        { event: "add", path: "/data/invoices/sub/deep/x.pdf" },
      ],
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.path).toBe("/data/invoices/top.pdf");
    expect(out[0][1].json.path).toBe("/data/invoices/sub/nested.pdf");
  });

  it("ignoreInitial drops items flagged initial", async () => {
    const { out } = await runTrigger(
      {
        triggerOn: "folder",
        path: "/data/invoices",
        events: ["add"],
        options: { ignoreInitial: true },
      },
      [
        { event: "add", path: "/data/invoices/exists.pdf", initial: true },
        { event: "add", path: "/data/invoices/new.pdf", initial: false },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.path).toBe("/data/invoices/new.pdf");
  });

  it("missing path fails arm — throws", async () => {
    await expect(
      runTrigger({ triggerOn: "folder", path: "", events: ["add"] }, [
        { event: "add", path: "/data/invoices/x.pdf" },
      ]),
    ).rejects.toThrow(/path/i);
  });

  it("missing triggerOn fails arm — throws", async () => {
    await expect(
      runTrigger({ path: "/data/invoices", events: ["add"] }, [
        { event: "add", path: "/data/invoices/x.pdf" },
      ]),
    ).rejects.toThrow(/triggerOn/i);
  });

  it("folder mode with empty events fails arm — throws", async () => {
    await expect(
      runTrigger({ triggerOn: "folder", path: "/data/invoices", events: [] }, [
        { event: "add", path: "/data/invoices/x.pdf" },
      ]),
    ).rejects.toThrow(/events/i);
  });

  it("empty input emits a single empty item (manual test arm)", async () => {
    const { out } = await runTrigger(
      { triggerOn: "file", path: "/data/invoices/1.pdf", options: {} },
      [],
    );

    expect(out[0]).toEqual([{ json: {} }]);
  });
});
