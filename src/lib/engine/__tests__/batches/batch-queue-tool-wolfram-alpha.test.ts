import { describe, it, expect, vi, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.toolWolframAlpha";

type ToolHandle = {
  type: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  invoke: (args: Record<string, unknown>) => Promise<{ content: string; isError?: boolean }>;
};

let fetchSpy: ReturnType<typeof vi.spyOn>;

function makeCtxWithCred(
  items: INodeExecutionData[],
  node: INode,
  credentials: Record<string, Record<string, unknown>>,
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
    continueOnFail: false,
    getCredential: async (name) => credentials[name] ?? null,
  });
}

async function runTool(
  parameters: Record<string, unknown> = {},
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  credentials: Record<string, Record<string, unknown>> = {},
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = inputItems.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): ToolHandle {
  return out[0][0].json as unknown as ToolHandle;
}

function mockFetch(status: number, body: string) {
  fetchSpy.mockImplementation(async () => {
    return new Response(body, { status });
  });
}

afterEach(() => {
  fetchSpy?.mockRestore();
});

describe("batch-queue toolWolframAlpha — @n8n/n8n-nodes-langchain.toolWolframAlpha", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Wolfram|Alpha Tool");
  });

  it("returns a tool handle with correct metadata on execution", async () => {
    const out = await runTool({}, [{}], {
      wolframAlphaApi: { appId: "demo-appid" },
    });

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.name).toBe("wolfram_alpha");
    expect(handle.inputSchema).toBeDefined();
    expect(handle.inputSchema.required).toEqual(["query"]);
  });

  it("returns plain-text answer for a basic query", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch");

    mockFetch(200, "2464 miles");

    const out = await runTool({}, [{}], {
      wolframAlphaApi: { appId: "demo-appid" },
    });

    const handle = getHandle(out);
    const result = await handle.invoke({ query: "How far is Los Angeles from New York?" });

    expect(result.content).toBe("2464 miles");
    expect(result.isError).toBeFalsy();

    const callUrl = fetchSpy.mock.calls[0][0] as string;
    expect(callUrl).toContain("api.wolframalpha.com/v1/result");
    expect(callUrl).toContain("appid=demo-appid");
    expect(callUrl).toContain("i=How+far+is+Los+Angeles+from+New+York%3F");
  });

  it("throws on missing credential", async () => {
    await expect(runTool({}, [{}], {})).rejects.toThrow(/wolframAlphaApi.*credential/i);
  });

  it("throws on missing appId in credential", async () => {
    await expect(
      runTool({}, [{}], { wolframAlphaApi: {} }),
    ).rejects.toThrow(/App ID/i);
  });

  it("surfaces HTTP 501 as tool error", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    mockFetch(501, "No short answer available");

    const out = await runTool({}, [{}], {
      wolframAlphaApi: { appId: "demo-appid" },
    });

    const handle = getHandle(out);
    const result = await handle.invoke({ query: "unknown thing" });

    expect(result.isError).toBe(true);
    expect(result.content).toContain("501");
  });

  it("URL-encodes special characters in query", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    mockFetch(200, "0.886226925452758");

    const out = await runTool({}, [{}], {
      wolframAlphaApi: { appId: "demo-appid" },
    });

    const handle = getHandle(out);
    await handle.invoke({ query: "what is the integral of e^(-x^2) from 0 to 1?" });

    const callUrl = fetchSpy.mock.calls[0][0] as string;
    expect(callUrl).toContain("e%5E%28-x%5E2%29");
    expect(callUrl).toContain("i=what+is+the+integral+of");
  });

  it("surfaces HTTP 400 as tool error", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    mockFetch(400, "Bad input");

    const out = await runTool({}, [{}], {
      wolframAlphaApi: { appId: "demo-appid" },
    });

    const handle = getHandle(out);
    const result = await handle.invoke({ query: "!!invalid!!" });

    expect(result.isError).toBe(true);
    expect(result.content).toContain("400");
  });

  it("surfaces empty query gracefully without making HTTP call", async () => {
    const out = await runTool({}, [{}], {
      wolframAlphaApi: { appId: "demo-appid" },
    });

    const handle = getHandle(out);
    const result = await handle.invoke({ query: "" });

    expect(result.content).toBe("No query provided.");
    expect(result.isError).toBeFalsy();
  });

  it("no main items emitted", async () => {
    const out = await runTool({}, [{}], {
      wolframAlphaApi: { appId: "demo-appid" },
    });

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toBeDefined();
    expect(out[0][0].pairedItem).toBeDefined();
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});
