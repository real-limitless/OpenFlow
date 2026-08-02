import { describe, it, expect, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.toolWorkflow";

type ToolHandle = {
  name: string;
  description: string;
  invoke: (args: Record<string, unknown>) => Promise<{ content: string; isError?: boolean }>;
};

function makeCtxWithSubWorkflow(
  items: INodeExecutionData[],
  node: INode,
  runSubWorkflow?: NonNullable<ExecutionContext["runSubWorkflow"]>,
  continueOnFail = false,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async () => null,
    runSubWorkflow,
  });
}

async function runTool(
  parameters: Record<string, unknown> = {},
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  runSubWorkflow?: NonNullable<ExecutionContext["runSubWorkflow"]>,
  continueOnFail = false,
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = inputItems.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
  const ctx = makeCtxWithSubWorkflow(items, node, runSubWorkflow, continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): ToolHandle {
  return out[0][0].json as unknown as ToolHandle;
}

describe("batch-queue toolWorkflow — @n8n/n8n-nodes-langchain.toolWorkflow", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Call n8n Workflow Tool");
  });

  it("returns a tool handle with correct metadata on execution", async () => {
    const out = await runTool(
      { name: "get_city_weather", description: "Get the weather for a city" },
      [{}],
    );
    const handle = getHandle(out);
    expect(handle.name).toBe("get_city_weather");
    expect(handle.description).toBe("Get the weather for a city");
    expect(typeof handle.invoke).toBe("function");
  });

  it("call-by-id invokes sub-workflow and returns output", async () => {
    const subWorkflowFn = vi.fn(async () => [{ json: { result: "sunny", temp: 22 } }]);
    const out = await runTool(
      {
        name: "get_city_weather",
        description: "Get the weather for a city",
        source: "database",
        workflowId: "wf-echo",
        workflowInputs: { values: [{ name: "city", type: "string", value: "London" }] },
      },
      [{}],
      subWorkflowFn,
    );
    const handle = getHandle(out);
    const result = await handle.invoke({});
    expect(subWorkflowFn).toHaveBeenCalledOnce();
    const callArg = subWorkflowFn.mock.calls[0][0];
    expect(callArg.workflowId).toBe("wf-echo");
    expect(callArg.items[0].json).toMatchObject({ city: "London" });
    expect(result.content).toContain("sunny");
    expect(result.isError).toBeFalsy();
  });

  it("call-by-id with model-supplied arguments merges with configured inputs", async () => {
    const subWorkflowFn = vi.fn(async () => [{ json: { result: "ok" } }]);
    const out = await runTool(
      {
        name: "get_city_weather",
        source: "database",
        workflowId: "wf-echo",
        workflowInputs: { values: [{ name: "city", type: "string", value: "London" }] },
      },
      [{}],
      subWorkflowFn,
    );
    const handle = getHandle(out);
    const result = await handle.invoke({ city: "Paris" });
    expect(result.content).toContain("ok");
    expect(subWorkflowFn.mock.calls[0][0].items[0].json).toMatchObject({ city: "Paris" });
  });

  it("define-below source runs parsed workflow JSON", async () => {
    const subWorkflowFn = vi.fn(async () => [{ json: { result: "ok" } }]);
    const out = await runTool(
      {
        name: "ping",
        source: "parameter",
        workflowJson: JSON.stringify({ nodes: [], connections: {} }),
      },
      [{}],
      subWorkflowFn,
    );
    const handle = getHandle(out);
    const result = await handle.invoke({});
    expect(subWorkflowFn).toHaveBeenCalledOnce();
    expect(subWorkflowFn.mock.calls[0][0].workflowJson).toBeDefined();
    expect(result.content).toContain("ok");
  });

  it("throws when name is missing", async () => {
    await expect(runTool({}, [{}])).rejects.toThrow(/name.*required/i);
  });

  it("fails gracefully when sub-workflow execution is not available", async () => {
    const out = await runTool(
      { name: "test", source: "database", workflowId: "wf-echo" },
      [{}],
    );
    const handle = getHandle(out);
    const result = await handle.invoke({});
    expect(result.isError).toBe(true);
    expect(result.content).toContain("not available");
  });

  it("reports missing workflowId for database source", async () => {
    const subWorkflowFn = vi.fn(async () => [{ json: {} }]);
    const out = await runTool(
      { name: "test", source: "database", workflowId: "" },
      [{}],
      subWorkflowFn,
    );
    const handle = getHandle(out);
    const result = await handle.invoke({});
    expect(result.isError).toBe(true);
    expect(result.content).toContain("No workflowId");
  });

  it("reports invalid workflowJson", async () => {
    const subWorkflowFn = vi.fn(async () => [{ json: {} }]);
    const out = await runTool(
      { name: "test", source: "parameter", workflowJson: "not-json" },
      [{}],
      subWorkflowFn,
    );
    const handle = getHandle(out);
    const result = await handle.invoke({});
    expect(result.isError).toBe(true);
    expect(result.content).toContain("could not parse");
  });

  it("surfaces sub-workflow execution errors", async () => {
    const subWorkflowFn = vi.fn(async () => {
      throw new Error("Something went wrong in sub-workflow");
    });
    const out = await runTool(
      { name: "test", source: "database", workflowId: "wf-explode" },
      [{}],
      subWorkflowFn,
    );
    const handle = getHandle(out);
    await expect(handle.invoke({})).rejects.toThrow(/sub-workflow/i);
  });

  it("returns error payload on failure when continueOnFail is set", async () => {
    const subWorkflowFn = vi.fn(async () => {
      throw new Error("Something went wrong in sub-workflow");
    });
    const out = await runTool(
      { name: "test", source: "database", workflowId: "wf-explode" },
      [{}],
      subWorkflowFn,
      true,
    );
    const handle = getHandle(out);
    const result = await handle.invoke({});
    expect(result.isError).toBe(true);
    expect(result.content).toContain("failed");
  });

  it("tool name contract: preserves letters, digits, underscores", async () => {
    const out = await runTool(
      { name: "get_weather_2", description: "Test" },
      [{}],
    );
    const handle = getHandle(out);
    expect(handle.name).toBe("get_weather_2");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});
